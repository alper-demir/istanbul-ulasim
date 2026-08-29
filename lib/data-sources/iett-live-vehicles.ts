import type { TransitVehicle } from '@/lib/transit-fixtures';
import { IETT_SOURCES } from '@/lib/data-sources/iett';

const CACHE_TTL_MS = 60_000;
const UPSTREAM_TIMEOUT_MS = 8_000;

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

type CacheEntry = { snapshot:LiveVehicleSnapshot; expiresAt:number };

const snapshotCache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<LiveVehicleSnapshot>>();

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

async function fetchSnapshot(routeCode: string) {
  const response = await fetch(IETT_SOURCES.vehiclePositions.endpoint, {
    method:'POST',
    headers:{ 'Content-Type':'text/xml; charset=utf-8', SOAPAction:'http://tempuri.org/GetHatOtoKonum_json' },
    body:soapEnvelope(routeCode),
    cache:'no-store',
    signal:AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`İETT canlı araç servisi ${response.status} döndürdü`);
  return parseIettLiveVehicleResponse(await response.text(), routeCode);
}

export async function getIettLiveVehicles(routeCode: string): Promise<CachedLiveVehicleSnapshot> {
  const key = routeCode.trim().toLocaleUpperCase('tr-TR');
  const now = Date.now();
  const cached = snapshotCache.get(key);
  if (cached && cached.expiresAt > now) return { ...cached.snapshot, cacheStatus:'hit', cacheTtlMs:CACHE_TTL_MS };

  let pending = pendingRequests.get(key);
  if (!pending) {
    pending = fetchSnapshot(key);
    pendingRequests.set(key, pending);
  }

  try {
    const snapshot = await pending;
    snapshotCache.set(key, { snapshot, expiresAt:Date.now() + CACHE_TTL_MS });
    return { ...snapshot, cacheStatus:'miss', cacheTtlMs:CACHE_TTL_MS };
  } catch (error) {
    if (cached) return { ...cached.snapshot, cacheStatus:'stale', cacheTtlMs:CACHE_TTL_MS };
    throw error;
  } finally {
    if (pendingRequests.get(key) === pending) pendingRequests.delete(key);
  }
}
