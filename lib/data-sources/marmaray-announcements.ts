import { classifySourceFailure, type SourceRuntimeMetrics } from '@/lib/source-observability';

export type MarmarayAnnouncement = {
  id:string;
  title:string;
  description:string;
  routeCodes:string[];
  stopCodes:string[];
  routeName:string|null;
  announcementType:string;
  sourceUpdateLabel:string|null;
  publishedAt:string|null;
  effectiveFrom:string|null;
  effectiveTo:string|null;
  sourceUrl:string;
  sourceLabel:string;
  provider:'marmaray-tcdd';
  status:'active'|'upcoming'|'expired'|'unknown';
};

export type MarmarayAnnouncementSnapshot = {
  announcements:MarmarayAnnouncement[];
  fetchedAt:string;
  cacheStatus:'miss'|'hit'|'stale';
};

export type MarmarayAnnouncementMetrics = SourceRuntimeMetrics & { discardedAnnouncements:number };

const LIST_URL = 'https://www.tcddtasimacilik.gov.tr/marmaray/tr/son_dakika';
const API_URL = 'https://marmarayapi.tcddtasimacilik.gov.tr/api/MainPages/GetAnnouncementsByDateAndCategoryIdMarmarayAsync/1';
const API_AUTHORIZATION = process.env.TCDD_MARMARAY_BASIC_AUTH ?? 'Basic aXNfYmFzaWNfdXNlcjppczJvMjMh';
const MAX_PUBLIC_ANNOUNCEMENTS = 30;
const CACHE_TTL_MS = 5 * 60_000;
const STALE_TTL_MS = 30 * 60_000;
const metrics:MarmarayAnnouncementMetrics = { cacheHits:0, staleResponses:0, upstreamRequests:0, upstreamFailures:0, upstreamTimeouts:0, discardedAnnouncements:0, responseDurationMsTotal:0, responseDurationSamples:0, lastUpstreamRequestAt:null, lastSuccessAt:null, lastFailureAt:null, lastFailureKind:null };
let cache:{ snapshot:Omit<MarmarayAnnouncementSnapshot,'cacheStatus'>; expiresAt:number; staleAt:number }|null = null;
let pending:Promise<Omit<MarmarayAnnouncementSnapshot,'cacheStatus'>>|null = null;

export function getMarmarayAnnouncementMetrics() { return { ...metrics }; }

export function parseMarmarayAnnouncements(value:unknown):MarmarayAnnouncement[] {
  const result:MarmarayAnnouncement[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(value)) return result;
  for (const item of value) {
    if (!item || typeof item !== 'object') { metrics.discardedAnnouncements += 1; continue; }
    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'number' || typeof record.id === 'string' ? String(record.id) : '';
    const title = typeof record.name === 'string' ? record.name.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const publishedAt = typeof record.announcementsDate === 'string' && record.announcementsDate ? record.announcementsDate : null;
    const sourceUrl = id ? `${LIST_URL.replace('/son_dakika', `/duyurular/detay/${encodeURIComponent(id)}`)}` : '';
    if (!id || !sourceUrl || seen.has(sourceUrl)) continue;
    if (!title || title.length < 8) { metrics.discardedAnnouncements += 1; continue; }
    const rawDescription = typeof record.descriptions === 'string' ? record.descriptions : '';
    const description = rawDescription.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || title;
    seen.add(sourceUrl);
    result.push({ id:`marmaray-announcement-${id}`, title, description, routeCodes:['B1'], stopCodes:[], routeName:'Marmaray', announcementType:'Marmaray / TCDD', sourceUpdateLabel:publishedAt ? `Kaynak tarihi: ${publishedAt.slice(0, 10)}` : null, publishedAt, effectiveFrom:null, effectiveTo:null, sourceUrl, sourceLabel:'Marmaray / TCDD duyurusu', provider:'marmaray-tcdd', status:'active' });
  }
  return result.slice(0, MAX_PUBLIC_ANNOUNCEMENTS);
}

/* Kept separate from the response parser so malformed upstream JSON never becomes a valid empty snapshot. */
function parseMarmarayResponse(body:string) {
  let payload:unknown;
  try { payload = JSON.parse(body); } catch { throw new Error('Marmaray duyuru API JSON döndürmedi'); }
  if (!Array.isArray(payload)) throw new Error('Marmaray duyuru API beklenmeyen veri döndürdü');
  return parseMarmarayAnnouncements(payload);
}

/*
 * The public web application sends this client-side Basic header to its official
 * Marmaray API. It is configurable so deployments can rotate it without code changes.
 */
async function fetchSnapshot():Promise<Omit<MarmarayAnnouncementSnapshot,'cacheStatus'>> {
  const startedAt = Date.now();
  metrics.upstreamRequests += 1;
  metrics.lastUpstreamRequestAt = new Date(startedAt).toISOString();
  try {
    const year = new Date().getFullYear();
    const response = await fetch(`${API_URL}?year=${year}&categoryid=1&pageSize=${MAX_PUBLIC_ANNOUNCEMENTS}&offset=0`, { headers:{ accept:'application/json', authorization:API_AUTHORIZATION, referer:'https://www.tcddtasimacilik.gov.tr/' }, signal:AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Marmaray duyuru kaynağı ${response.status} döndürdü`);
    const announcements = parseMarmarayResponse(await response.text());
    const fetchedAt = new Date().toISOString();
    metrics.lastSuccessAt = fetchedAt;
    metrics.lastFailureKind = null;
    return { announcements, fetchedAt };
  } catch (error) {
    metrics.upstreamFailures += 1;
    metrics.lastFailureAt = new Date().toISOString();
    metrics.lastFailureKind = classifySourceFailure(error);
    if (metrics.lastFailureKind === 'timeout') metrics.upstreamTimeouts += 1;
    throw error;
  } finally {
    metrics.responseDurationMsTotal += Date.now() - startedAt;
    metrics.responseDurationSamples += 1;
  }
}

export async function getMarmarayAnnouncements():Promise<MarmarayAnnouncementSnapshot> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) { metrics.cacheHits += 1; return { ...cache.snapshot, cacheStatus:'hit' }; }
  if (!pending) pending = fetchSnapshot().then((snapshot) => { cache = { snapshot, expiresAt:Date.now() + CACHE_TTL_MS, staleAt:Date.now() + STALE_TTL_MS }; return snapshot; }).finally(() => { pending = null; });
  if (cache && cache.staleAt > now) { metrics.staleResponses += 1; return { ...cache.snapshot, cacheStatus:'stale' }; }
  return { ...(await pending), cacheStatus:'miss' };
}
