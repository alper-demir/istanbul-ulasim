import { classifySourceFailure, type SourceRuntimeMetrics } from '@/lib/source-observability';

export type MetroAnnouncement = {
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
  provider:'metro-istanbul';
  status:'active'|'upcoming'|'expired'|'unknown';
};

export type MetroAnnouncementSnapshot = {
  announcements:MetroAnnouncement[];
  fetchedAt:string;
  cacheStatus:'miss'|'hit'|'stale';
};

export type MetroAnnouncementMetrics = SourceRuntimeMetrics & { discardedAnnouncements:number };

const LIST_URL = 'https://www.metro.istanbul/Home/Duyurular';
const MAX_PUBLIC_ANNOUNCEMENTS = 30;
const CACHE_TTL_MS = 5 * 60_000;
const STALE_TTL_MS = 30 * 60_000;
const metrics:MetroAnnouncementMetrics = { cacheHits:0, staleResponses:0, upstreamRequests:0, upstreamFailures:0, upstreamTimeouts:0, discardedAnnouncements:0, responseDurationMsTotal:0, responseDurationSamples:0, lastUpstreamRequestAt:null, lastSuccessAt:null, lastFailureAt:null, lastFailureKind:null };
let cache:{ snapshot:Omit<MetroAnnouncementSnapshot,'cacheStatus'>; expiresAt:number; staleAt:number }|null = null;
let pending:Promise<Omit<MetroAnnouncementSnapshot,'cacheStatus'>>|null = null;

export function getMetroAnnouncementMetrics() { return { ...metrics }; }

function text(value:string) { return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, ' ').trim(); }

function routeCodes(value:string) {
  return [...new Set(value.toUpperCase().match(/\b(?:M|T|F)\d+[A-Z]?\b/gu) ?? [])];
}

export function parseMetroAnnouncements(html:string):MetroAnnouncement[] {
  const result:MetroAnnouncement[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<div\s+class="caption">([\s\S]*?)<\/div>/gi)) {
    const block = match[1] ?? '';
    const href = block.match(/href="([^"]*\/duyuru\/detay\/[^"#?]+)"/i)?.[1];
    const title = text(block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i)?.[1] ?? '');
    const description = text(block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '');
    if (!href || !title || !description) { metrics.discardedAnnouncements += 1; continue; }
    const sourceUrl = new URL(href, LIST_URL).toString();
    if (seen.has(sourceUrl)) continue;
    seen.add(sourceUrl);
    result.push({ id:`metro-announcement-${result.length + 1}`, title, description, routeCodes:routeCodes(`${title} ${description}`), stopCodes:[], routeName:null, announcementType:'Metro İstanbul', sourceUpdateLabel:null, publishedAt:null, effectiveFrom:null, effectiveTo:null, sourceUrl, sourceLabel:'Metro İstanbul duyurusu', provider:'metro-istanbul', status:'active' });
  }
  return result.slice(0, MAX_PUBLIC_ANNOUNCEMENTS);
}

async function fetchSnapshot():Promise<Omit<MetroAnnouncementSnapshot,'cacheStatus'>> {
  const startedAt = Date.now();
  metrics.upstreamRequests += 1;
  metrics.lastUpstreamRequestAt = new Date(startedAt).toISOString();
  try {
    const response = await fetch(LIST_URL, { headers:{ accept:'text/html,application/xhtml+xml', 'user-agent':'istanbulum-announcement-reader/0.11' }, signal:AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Metro İstanbul duyuru kaynağı ${response.status} döndürdü`);
    const announcements = parseMetroAnnouncements(await response.text());
    if (!announcements.length) throw new Error('Metro İstanbul duyuru listesi boş veya beklenmeyen yapıda');
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

export async function getMetroAnnouncements():Promise<MetroAnnouncementSnapshot> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) { metrics.cacheHits += 1; return { ...cache.snapshot, cacheStatus:'hit' }; }
  if (!pending) pending = fetchSnapshot().then((snapshot) => { cache = { snapshot, expiresAt:Date.now() + CACHE_TTL_MS, staleAt:Date.now() + STALE_TTL_MS }; return snapshot; }).finally(() => { pending = null; });
  if (cache && cache.staleAt > now) { metrics.staleResponses += 1; return { ...cache.snapshot, cacheStatus:'stale' }; }
  return { ...(await pending), cacheStatus:'miss' };
}
