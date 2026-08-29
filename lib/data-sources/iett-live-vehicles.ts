import type { TransitVehicle } from '@/lib/transit-fixtures';
import { IETT_SOURCES } from '@/lib/data-sources/iett';

const CACHE_TTL_MS = 30_000;
const STALE_CACHE_TTL_MS = 10 * 60 * 1_000;
const UPSTREAM_TIMEOUT_MS = 10_000;
const UPSTREAM_RATE_WINDOW_MS = 60 * 60 * 1_000;
const UPSTREAM_RATE_LIMIT = 90;
// The IETT SOAP endpoint is much more reliable with one in-flight request.
// Parallel calls occasionally leave both sockets hanging until timeout.
const MIN_UPSTREAM_REQUEST_INTERVAL_MS = 750;
const MAX_QUEUED_REQUESTS = 240;
// This must exceed the upstream timeout. In short-lived local/serverless
// runtimes, returning `pending` first can discard the in-flight refresh and
// leave every client retry stuck in the same state.
const MAX_QUEUE_WAIT_MS = 20_000;
const FAILURE_BACKOFF_MS = 15_000;
const MAX_CACHE_ENTRIES = 360;

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
  cacheStatus: 'hit' | 'miss' | 'stale' | 'pending';
  cacheTtlMs: number;
};

type CacheEntry = { snapshot:LiveVehicleSnapshot; expiresAt:number; staleAt:number };
type QueuedRequest = {
  routeCode:string;
  resolve:(snapshot:LiveVehicleSnapshot) => void;
  reject:(error:unknown) => void;
};
type FailureEntry = { retryAt:number; error:unknown };

const snapshotCache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<LiveVehicleSnapshot>>();
const upstreamRequestTimes: number[] = [];
const requestQueue: QueuedRequest[] = [];
const recentFailures = new Map<string, FailureEntry>();
let lastUpstreamRequestAt = 0;
let queueRunning = false;

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

async function drainQueue() {
  if (queueRunning) return;
  queueRunning = true;
  try {
    while (requestQueue.length) {
      const delay = Math.max(0, lastUpstreamRequestAt + MIN_UPSTREAM_REQUEST_INTERVAL_MS - Date.now());
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      const next = requestQueue.shift();
      if (!next) continue;
      lastUpstreamRequestAt = Date.now();
      try {
        next.resolve(await fetchSnapshot(next.routeCode));
      } catch (error) {
        next.reject(error);
      } finally {
      }
    }
  } finally {
    queueRunning = false;
    if (requestQueue.length) void drainQueue();
  }
}

function enqueueSnapshot(routeCode: string) {
  if (requestQueue.length >= MAX_QUEUED_REQUESTS) {
    return Promise.reject(new Error('Canlı araç yenileme kuyruğu dolu'));
  }
  return new Promise<LiveVehicleSnapshot>((resolve, reject) => {
    requestQueue.push({ routeCode, resolve, reject });
    void drainQueue();
  });
}

async function fetchSnapshot(routeCode: string) {
  const now = Date.now();
  while (upstreamRequestTimes[0] && upstreamRequestTimes[0] <= now - UPSTREAM_RATE_WINDOW_MS) upstreamRequestTimes.shift();
  if (upstreamRequestTimes.length >= UPSTREAM_RATE_LIMIT) throw new Error('İETT canlı araç servisinin saatlik istek bütçesi doldu');
  upstreamRequestTimes.push(now);

  const response = await fetch(IETT_SOURCES.vehiclePositions.endpoint, {
    method:'POST',
    headers:{ 'Content-Type':'text/xml; charset=utf-8', Connection:'close', SOAPAction:'http://tempuri.org/GetHatOtoKonum_json' },
    body:soapEnvelope(routeCode),
    cache:'no-store',
    signal:AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`İETT canlı araç servisi ${response.status} döndürdü`);
  return parseIettLiveVehicleResponse(await response.text(), routeCode);
}

function pendingSnapshot(): CachedLiveVehicleSnapshot {
  return {
    vehicles:[],
    fetchedAt:new Date().toISOString(),
    newestPositionAt:null,
    discardedVehicleCount:0,
    cacheStatus:'pending',
    cacheTtlMs:CACHE_TTL_MS,
  };
}

async function waitForSnapshotOrQueueState(pending: Promise<LiveVehicleSnapshot>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<null>((resolve) => { timeout = setTimeout(() => resolve(null), MAX_QUEUE_WAIT_MS); }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function getIettLiveVehicles(routeCode: string): Promise<CachedLiveVehicleSnapshot> {
  const key = routeCode.trim().toLocaleUpperCase('tr-TR');
  const now = Date.now();
  pruneCache(now);
  const cached = readCache(key, now);
  if (cached && cached.expiresAt > now) return { ...cached.snapshot, cacheStatus:'hit', cacheTtlMs:CACHE_TTL_MS };

  let pending = pendingRequests.get(key);
  if (!pending) {
    const failure = recentFailures.get(key);
    if (failure && failure.retryAt > now) {
      if (cached) return { ...cached.snapshot, cacheStatus:'stale', cacheTtlMs:CACHE_TTL_MS };
      throw failure.error;
    }
    pending = enqueueSnapshot(key)
      .then((snapshot) => {
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
  if (cached) return { ...cached.snapshot, cacheStatus:'stale', cacheTtlMs:CACHE_TTL_MS };

  try {
    const snapshot = await waitForSnapshotOrQueueState(pending);
    if (!snapshot) return pendingSnapshot();
    return { ...snapshot, cacheStatus:'miss', cacheTtlMs:CACHE_TTL_MS };
  } catch (error) {
    throw error;
  }
}
