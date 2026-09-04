export type AnnouncementStatus = 'active' | 'upcoming' | 'expired' | 'unknown';

export type IettAnnouncement = {
  id: string;
  title: string;
  description: string;
  routeCodes: string[];
  stopCodes: string[];
  publishedAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  sourceUrl: string;
  status: AnnouncementStatus;
};

export type AnnouncementSnapshot = {
  announcements: IettAnnouncement[];
  fetchedAt: string;
  cacheStatus: 'miss' | 'hit' | 'stale';
};

export type AnnouncementMetrics = {
  cacheHits: number;
  staleResponses: number;
  upstreamRequests: number;
  upstreamFailures: number;
  upstreamTimeouts: number;
  discardedAnnouncements: number;
  responseDurationMsTotal: number;
  responseDurationSamples: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
};

const ENDPOINT = 'https://api.ibb.gov.tr/iett/UlasimDinamikVeri/Duyurular.asmx';
const SOURCE_URL = 'https://iett.istanbul/announcement/Index';
const CACHE_TTL_MS = 120_000;
const STALE_TTL_MS = 30 * 60_000;
const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_000_000;
let cache: { snapshot: Omit<AnnouncementSnapshot, 'cacheStatus'>; expiresAt: number; staleAt: number } | null = null;
let pending: Promise<Omit<AnnouncementSnapshot, 'cacheStatus'>> | null = null;
const metrics: AnnouncementMetrics = {
  cacheHits: 0,
  staleResponses: 0,
  upstreamRequests: 0,
  upstreamFailures: 0,
  upstreamTimeouts: 0,
  discardedAnnouncements: 0,
  responseDurationMsTotal: 0,
  responseDurationSamples: 0,
  lastSuccessAt: null,
  lastFailureAt: null,
};

export function getIettAnnouncementMetrics(): AnnouncementMetrics {
  return { ...metrics };
}

function text(value: unknown) {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

function decodeXmlEntities(value: string) {
  return value.replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
}

function pick(record: Record<string, unknown>, names: string[]) {
  const entry = Object.entries(record).find(([key]) => names.some((name) => key.toLowerCase() === name.toLowerCase()));
  return entry?.[1];
}

function arrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['Table', 'Duyuru', 'Duyurular', 'data', 'items']) if (key in record) return arrayValue(record[key]);
  }
  return [];
}

function parseDate(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function codes(value: unknown) {
  return [...new Set(text(value).split(/[;,|\s]+/u).map((item) => item.trim().toLocaleUpperCase('tr-TR')).filter(Boolean))];
}

function statusFor(from: string | null, to: string | null, now = Date.now()): AnnouncementStatus {
  if (!from && !to) return 'unknown';
  if (from && Date.parse(from) > now) return 'upcoming';
  if (to && Date.parse(to) < now) return 'expired';
  return 'active';
}

export function normalizeIettAnnouncements(value: unknown, now = Date.now()): IettAnnouncement[] {
  const records = arrayValue(value).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
  const seen = new Set<string>();
  const normalized: IettAnnouncement[] = [];
  records.forEach((record, index) => {
    const id = text(pick(record, ['id', 'duyuruid', 'duyuruid'])) || `iett-announcement-${index + 1}`;
    const title = text(pick(record, ['title', 'baslik', 'duyurubaslik'])) || 'İETT duyurusu';
    const description = text(pick(record, ['description', 'aciklama', 'duyuru'])) || title;
    const publishedAt = parseDate(pick(record, ['publishedAt', 'tarih', 'duyurutarihi', 'yayinlanmatarihi']));
    const effectiveFrom = parseDate(pick(record, ['effectiveFrom', 'baslangictarihi', 'gecerlilikbaslangic']));
    const effectiveTo = parseDate(pick(record, ['effectiveTo', 'bitistarihi', 'gecerlilikbitis']));
    const routeCodes = codes(pick(record, ['routeCodes', 'hatkodu', 'hatlar', 'hat']));
    const stopCodes = codes(pick(record, ['stopCodes', 'durakkodu', 'duraklar', 'durak']));
    const item: IettAnnouncement = { id, title, description, routeCodes, stopCodes, publishedAt, effectiveFrom, effectiveTo, sourceUrl: SOURCE_URL, status: statusFor(effectiveFrom, effectiveTo, now) };
    if (seen.has(id)) return;
    seen.add(id);
    if (item.status !== 'expired') normalized.push(item);
  });
  return normalized;
}

function soapEnvelope() {
  return '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetDuyurular_json xmlns="http://tempuri.org/" /></soap:Body></soap:Envelope>';
}

export function parseIettAnnouncementResponse(body: string, now = Date.now()): IettAnnouncement[] {
  const jsonMatch = body.match(/(?:<[^>]*GetDuyurular_jsonResult[^>]*>)([\s\S]*?)(?:<\/[^>]*GetDuyurular_jsonResult>)/i);
  let parsed: unknown = null;
  if (jsonMatch) {
    try {
      parsed = JSON.parse(decodeXmlEntities(text(jsonMatch[1])));
    } catch {
      parsed = null;
    }
  }
  if (!parsed) {
    parsed = [...body.matchAll(/<Duyuru(?:\s[^>]*)?>([\s\S]*?)<\/Duyuru>/gi)].map((match) => Object.fromEntries([...match[1].matchAll(/<([^>]+)>([\s\S]*?)<\/\1>/g)].map((item) => [item[1], text(decodeXmlEntities(item[2]))])));
  }
  return normalizeIettAnnouncements(parsed, now);
}

async function fetchSnapshot(): Promise<Omit<AnnouncementSnapshot, 'cacheStatus'>> {
  const startedAt = Date.now();
  metrics.upstreamRequests += 1;
  try {
    const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'text/xml; charset=utf-8', SOAPAction: 'http://tempuri.org/GetDuyurular_json' }, body: soapEnvelope(), signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`İETT duyuru kaynağı ${response.status} döndürdü`);
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new Error('İETT duyuru yanıtı güvenli boyut sınırını aştı');
    const body = await response.text();
    if (body.length > MAX_RESPONSE_BYTES) throw new Error('İETT duyuru yanıtı güvenli boyut sınırını aştı');
    const records = jsonMatchRecordCount(body);
    const announcements = parseIettAnnouncementResponse(body);
    metrics.discardedAnnouncements += Math.max(0, records - announcements.length);
    metrics.lastSuccessAt = new Date().toISOString();
    return { announcements, fetchedAt: new Date().toISOString() };
  } catch (error) {
    metrics.upstreamFailures += 1;
    metrics.lastFailureAt = new Date().toISOString();
    if (error instanceof DOMException && error.name === 'TimeoutError') metrics.upstreamTimeouts += 1;
    throw error;
  } finally {
    metrics.responseDurationMsTotal += Date.now() - startedAt;
    metrics.responseDurationSamples += 1;
  }
}

function jsonMatchRecordCount(body: string) {
  const result = body.match(/(?:<[^>]*GetDuyurular_jsonResult[^>]*>)([\s\S]*?)(?:<\/[^>]*GetDuyurular_jsonResult>)/i)?.[1];
  if (!result) return [...body.matchAll(/<Duyuru(?:\s[^>]*)?>/gi)].length;
  try { return arrayValue(JSON.parse(decodeXmlEntities(text(result)))).length; } catch { return 0; }
}

export async function getIettAnnouncements(): Promise<AnnouncementSnapshot> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    metrics.cacheHits += 1;
    return { ...cache.snapshot, cacheStatus: 'hit' };
  }
  if (!pending) {
    pending = fetchSnapshot().then((snapshot) => {
      cache = { snapshot, expiresAt: Date.now() + CACHE_TTL_MS, staleAt: Date.now() + STALE_TTL_MS };
      return snapshot;
    }).finally(() => { pending = null; });
  }
  if (cache && cache.staleAt > now) {
    metrics.staleResponses += 1;
    return { ...cache.snapshot, cacheStatus: 'stale' };
  }
  return { ...(await pending), cacheStatus: 'miss' };
}
