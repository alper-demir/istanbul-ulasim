import type { TransitVehicle } from '@/lib/transit-fixtures';
import { IETT_SOURCES } from '@/lib/data-sources/iett';

function configuredMilliseconds(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function configuredLimit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback;
}

// Keep the server snapshot aligned with the focused-route client polling
// interval. This makes a normal refresh eligible for a newer upstream value
// without increasing the number of route queries made by the interface.
const CACHE_TTL_MS = configuredMilliseconds('IETT_LIVE_CACHE_TTL_MS', 30_000);
const STALE_CACHE_TTL_MS = configuredMilliseconds('IETT_LIVE_STALE_TTL_MS', 10 * 60 * 1_000);
const UPSTREAM_TIMEOUT_MS = configuredMilliseconds('IETT_LIVE_TIMEOUT_MS', 10_000);
const UPSTREAM_RATE_WINDOW_MS = 60 * 60 * 1_000;
// This deliberately conservative default protects an undocumented upstream
// quota. Hosting can raise it only after observing source health in production.
const UPSTREAM_RATE_LIMIT = configuredLimit('IETT_LIVE_MAX_REQUESTS_PER_HOUR', 360);
const FAILURE_BACKOFF_MS = configuredMilliseconds('IETT_LIVE_FAILURE_BACKOFF_MS', 15_000);
const MAX_UPSTREAM_RESPONSE_BYTES = configuredLimit('IETT_LIVE_MAX_RESPONSE_BYTES', 1_000_000);
const MAX_CACHE_ENTRIES = configuredLimit('IETT_LIVE_MAX_CACHE_ENTRIES', 900);

type RawIettVehicle = {
  kapino?: string;
  boylam?: string;
  enlem?: string;
  hatkodu?: string;
  guzergahkodu?: string;
  hatad?: string;
  yon?: string;
  son_konum_zamani?: string;
  yakinDurakKodu?: string;
};

export type IettLiveVehicle = TransitVehicle & {
  routeCode: string;
  routeName: string;
  routeVariantCode: string;
  directionId: 'outbound' | 'return' | 'unknown';
  nearbyStopCode: string;
  updatedAt: string;
  source: 'ibb-iett-live';
};

export type LiveVehicleSnapshot = {
  vehicles: IettLiveVehicle[];
  fetchedAt: string;
  newestPositionAt: string | null;
  discardedVehicleCount: number;
};

export type CachedLiveVehicleSnapshot = LiveVehicleSnapshot & {
  cacheStatus: 'hit' | 'miss' | 'stale';
  cacheTtlMs: number;
};

export type LiveVehicleMetrics = {
  cacheHits:number;
  staleResponses:number;
  upstreamRequests:number;
  upstreamFailures:number;
  lastUpstreamRequestAt:string | null;
  lastSuccessAt:string | null;
  lastFailureAt:string | null;
};

type CacheEntry = { snapshot:LiveVehicleSnapshot; expiresAt:number; staleAt:number };
type FailureEntry = { retryAt:number; error:unknown };

const snapshotCache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<LiveVehicleSnapshot>>();
const upstreamRequestTimes: number[] = [];
const recentFailures = new Map<string, FailureEntry>();
const liveMetrics: LiveVehicleMetrics = {
  cacheHits:0, staleResponses:0, upstreamRequests:0, upstreamFailures:0,
  lastUpstreamRequestAt:null, lastSuccessAt:null, lastFailureAt:null,
};

export function getIettLiveVehicleMetrics(): LiveVehicleMetrics {
  return { ...liveMetrics };
}

function escapeXml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function decodeXml(value: string) {
  return value.replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
}

function parseIettDate(value?: string) {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+03:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function directionId(routeVariantCode: string) {
  if (/(?:^|_)G(?:_|$)/i.test(routeVariantCode)) return 'outbound' as const;
  if (/(?:^|_)D(?:_|$)/i.test(routeVariantCode)) return 'return' as const;
  return 'unknown' as const;
}

function validIstanbulCoordinate(longitude: number, latitude: number) {
  return longitude >= 27.5 && longitude <= 30.5 && latitude >= 40.5 && latitude <= 42;
}

export async function runWithTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(new Error('İETT canlı araç isteği zaman aşımına uğradı'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function normalizeVehicle(raw: RawIettVehicle, requestedRouteCode: string, now: Date): IettLiveVehicle | null {
  const longitude = Number(raw.boylam?.replace(',', '.'));
  const latitude = Number(raw.enlem?.replace(',', '.'));
  const doorCode = raw.kapino?.trim();
  if (!doorCode || !Number.isFinite(longitude) || !Number.isFinite(latitude) || !validIstanbulCoordinate(longitude, latitude)) return null;

  const updatedDate = parseIettDate(raw.son_konum_zamani);
  const routeVariantCode = raw.guzergahkodu?.trim() ?? '';
  const nearbyStopCode = raw.yakinDurakKodu?.trim() ?? '';
  const routeCode = raw.hatkodu?.trim() || requestedRouteCode;

  return {
    id:`iett-live:${routeCode}:${doorCode}:${routeVariantCode || 'unknown'}`,
    doorCode,
    coordinates:[longitude, latitude],
    speed:0,
    direction:raw.yon?.trim() || 'Yön bilgisi yok',
    nextStop:nearbyStopCode ? `Durak kodu ${nearbyStopCode}` : 'Yakın durak bilinmiyor',
    updatedSecondsAgo:updatedDate ? Math.max(0, Math.floor((now.getTime() - updatedDate.getTime()) / 1_000)) : 0,
    routeCode,
    routeName:raw.hatad?.trim() ?? '',
    routeVariantCode,
    directionId:directionId(routeVariantCode),
    nearbyStopCode,
    updatedAt:updatedDate?.toISOString() ?? now.toISOString(),
    source:'ibb-iett-live',
  };
}

function soapEnvelope(routeCode: string) {
  const username = process.env.IETT_LIVE_USERNAME ?? '';
  const password = process.env.IETT_LIVE_PASSWORD ?? '';
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header><AuthHeader xmlns="http://tempuri.org/"><Username>${escapeXml(username)}</Username><Password>${escapeXml(password)}</Password></AuthHeader></soap:Header>
  <soap:Body><GetHatOtoKonum_json xmlns="http://tempuri.org/"><HatKodu>${escapeXml(routeCode)}</HatKodu></GetHatOtoKonum_json></soap:Body>
</soap:Envelope>`;
}

export function parseIettLiveVehicleResponse(xml: string, routeCode: string, now = new Date()): LiveVehicleSnapshot {
  const result = xml.match(/<GetHatOtoKonum_jsonResult>([\s\S]*?)<\/GetHatOtoKonum_jsonResult>/i)?.[1];
  if (!result) throw new Error('İETT canlı araç yanıtı beklenen alanı içermiyor');

  const parsed = JSON.parse(decodeXml(result)) as RawIettVehicle[];
  if (!Array.isArray(parsed)) throw new Error('İETT canlı araç yanıtı liste biçiminde değil');
  const normalized = parsed.map((vehicle) => normalizeVehicle(vehicle, routeCode, now));
  const vehicles = normalized.filter((vehicle): vehicle is IettLiveVehicle => Boolean(vehicle));
  const newestPositionAt = vehicles.reduce<string | null>((newest, vehicle) => !newest || vehicle.updatedAt > newest ? vehicle.updatedAt : newest, null);

  return {
    vehicles,
    fetchedAt:now.toISOString(),
    newestPositionAt,
    discardedVehicleCount:normalized.length - vehicles.length,
  };
}

function pruneCache(now = Date.now()) {
  for (const [key, entry] of snapshotCache) {
    if (entry.staleAt <= now) snapshotCache.delete(key);
  }
  while (snapshotCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = snapshotCache.keys().next().value;
    if (!oldestKey) break;
    snapshotCache.delete(oldestKey);
  }
}

function readCache(routeCode: string, now = Date.now()) {
  const entry = snapshotCache.get(routeCode);
  if (!entry || entry.staleAt <= now) return null;
  // Map insertion order doubles as a small LRU list.
  snapshotCache.delete(routeCode);
  snapshotCache.set(routeCode, entry);
  return entry;
}

async function fetchSnapshot(routeCode: string) {
  const now = Date.now();
  while (upstreamRequestTimes[0] && upstreamRequestTimes[0] <= now - UPSTREAM_RATE_WINDOW_MS) upstreamRequestTimes.shift();
  if (UPSTREAM_RATE_LIMIT > 0 && upstreamRequestTimes.length >= UPSTREAM_RATE_LIMIT) throw new Error('İETT canlı araç servisinin saatlik istek bütçesi doldu');
  if (UPSTREAM_RATE_LIMIT > 0) upstreamRequestTimes.push(now);
  liveMetrics.upstreamRequests += 1;
  liveMetrics.lastUpstreamRequestAt = new Date(now).toISOString();

  const response = await runWithTimeout((signal) => fetch(IETT_SOURCES.vehiclePositions.endpoint, {
    method:'POST',
    headers:{ 'Content-Type':'text/xml; charset=utf-8', SOAPAction:'http://tempuri.org/GetHatOtoKonum_json' },
    body:soapEnvelope(routeCode),
    cache:'no-store',
    signal,
  }), UPSTREAM_TIMEOUT_MS);
  if (!response.ok) throw new Error(`İETT canlı araç servisi ${response.status} döndürdü`);
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_UPSTREAM_RESPONSE_BYTES) {
    throw new Error('İETT canlı araç yanıtı güvenli boyut sınırını aştı');
  }
  return parseIettLiveVehicleResponse(await response.text(), routeCode);
}

export async function getIettLiveVehicles(routeCode: string): Promise<CachedLiveVehicleSnapshot> {
  const key = routeCode.trim().toLocaleUpperCase('tr-TR');
  const now = Date.now();
  pruneCache(now);
  const cached = readCache(key, now);
  if (cached && cached.expiresAt > now) {
    liveMetrics.cacheHits += 1;
    return { ...cached.snapshot, cacheStatus:'hit', cacheTtlMs:CACHE_TTL_MS };
  }

  let pending = pendingRequests.get(key);
  if (!pending) {
    const failure = recentFailures.get(key);
    if (failure && failure.retryAt > now) {
      if (cached) return { ...cached.snapshot, cacheStatus:'stale', cacheTtlMs:CACHE_TTL_MS };
      throw failure.error;
    }
    pending = fetchSnapshot(key)
      .then((snapshot) => {
        liveMetrics.lastSuccessAt = new Date().toISOString();
        recentFailures.delete(key);
        snapshotCache.set(key, {
          snapshot,
          expiresAt:Date.now() + CACHE_TTL_MS,
          staleAt:Date.now() + STALE_CACHE_TTL_MS,
        });
        pruneCache();
        return snapshot;
      })
      .catch((error:unknown) => {
        liveMetrics.upstreamFailures += 1;
        liveMetrics.lastFailureAt = new Date().toISOString();
        recentFailures.set(key, { retryAt:Date.now() + FAILURE_BACKOFF_MS, error });
        throw error;
      });
    pendingRequests.set(key, pending);
    void pending.finally(() => {
      if (pendingRequests.get(key) === pending) pendingRequests.delete(key);
    }).catch(() => undefined);
  }

  // A stale value is immediately more useful than holding a map interaction
  // open behind a busy shared queue. The refresh continues in the background.
  if (cached) {
    liveMetrics.staleResponses += 1;
    return { ...cached.snapshot, cacheStatus:'stale', cacheTtlMs:CACHE_TTL_MS };
  }

  const snapshot = await pending;
  return { ...snapshot, cacheStatus:'miss', cacheTtlMs:CACHE_TTL_MS };
}
