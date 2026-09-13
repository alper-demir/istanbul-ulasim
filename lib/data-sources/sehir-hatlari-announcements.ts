import { classifySourceFailure, type SourceRuntimeMetrics } from '@/lib/source-observability';

export type SehirHatlariAnnouncement = {
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
  provider:'sehir-hatlari';
  status:'active'|'upcoming'|'expired'|'unknown';
};

export type SehirHatlariAnnouncementSnapshot = {
  announcements:SehirHatlariAnnouncement[];
  fetchedAt:string;
  cacheStatus:'miss'|'hit'|'stale';
};

export type SehirHatlariAnnouncementMetrics = SourceRuntimeMetrics & { discardedAnnouncements:number };

const LIST_URL = 'https://sehirhatlari.istanbul/tr/duyurular';
const MAX_PUBLIC_ANNOUNCEMENTS = 30;
const CACHE_TTL_MS = 5 * 60_000;
const STALE_TTL_MS = 30 * 60_000;
const metrics:SehirHatlariAnnouncementMetrics = { cacheHits:0, staleResponses:0, upstreamRequests:0, upstreamFailures:0, upstreamTimeouts:0, discardedAnnouncements:0, responseDurationMsTotal:0, responseDurationSamples:0, lastUpstreamRequestAt:null, lastSuccessAt:null, lastFailureAt:null, lastFailureKind:null };
let cache:{ snapshot:Omit<SehirHatlariAnnouncementSnapshot,'cacheStatus'>; expiresAt:number; staleAt:number }|null = null;
let pending:Promise<Omit<SehirHatlariAnnouncementSnapshot,'cacheStatus'>>|null = null;

export function getSehirHatlariAnnouncementMetrics() { return { ...metrics }; }

function text(value:string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#x27;/gi, "'").replace(/\s+/g, ' ').trim();
}

function routeCodes(value:string) {
  return [...new Set(value.toUpperCase().match(/\b(?:KADIKÖY|ÜSKÜDAR|BEŞİKTAŞ|EMİNÖNÜ|HALİÇ|BOSTANCI|ADALAR|BOĞAZ)\b/gu) ?? [])];
}

export function parseSehirHatlariAnnouncements(html:string):SehirHatlariAnnouncement[] {
  const result:SehirHatlariAnnouncement[] = [];
  const seen = new Set<string>();
  const linkPattern = /<a\b[^>]*href=["']([^"']*\/tr\/duyurular\/[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(linkPattern)) {
    const href = match[1] ?? '';
    const sourceUrl = new URL(href, LIST_URL).toString();
    if (seen.has(sourceUrl)) continue;
    const anchor = match[2] ?? '';
    const title = text(anchor).replace(/^[-–—•]\s*/u, '').trim();
    if (!title || title.length < 8) { metrics.discardedAnnouncements += 1; continue; }
    const nearby = html.slice(Math.max(0, (match.index ?? 0) - 600), Math.min(html.length, (match.index ?? 0) + match[0].length + 900));
    const description = text(nearby.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '') || title;
    seen.add(sourceUrl);
    result.push({ id:`sehir-hatlari-announcement-${result.length + 1}`, title, description, routeCodes:routeCodes(`${title} ${description}`), stopCodes:[], routeName:null, announcementType:'Şehir Hatları', sourceUpdateLabel:null, publishedAt:null, effectiveFrom:null, effectiveTo:null, sourceUrl, sourceLabel:'Şehir Hatları duyurusu', provider:'sehir-hatlari', status:'active' });
  }
  return result.slice(0, MAX_PUBLIC_ANNOUNCEMENTS);
}

async function fetchSnapshot():Promise<Omit<SehirHatlariAnnouncementSnapshot,'cacheStatus'>> {
  const startedAt = Date.now();
  metrics.upstreamRequests += 1;
  metrics.lastUpstreamRequestAt = new Date(startedAt).toISOString();
  try {
    const response = await fetch(LIST_URL, { headers:{ accept:'text/html,application/xhtml+xml', 'user-agent':'istanbulum-announcement-reader/0.11' }, signal:AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Şehir Hatları duyuru kaynağı ${response.status} döndürdü`);
    const announcements = parseSehirHatlariAnnouncements(await response.text());
    if (!announcements.length) throw new Error('Şehir Hatları duyuru listesi boş veya beklenmeyen yapıda');
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

export async function getSehirHatlariAnnouncements():Promise<SehirHatlariAnnouncementSnapshot> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) { metrics.cacheHits += 1; return { ...cache.snapshot, cacheStatus:'hit' }; }
  if (!pending) pending = fetchSnapshot().then((snapshot) => { cache = { snapshot, expiresAt:Date.now() + CACHE_TTL_MS, staleAt:Date.now() + STALE_TTL_MS }; return snapshot; }).finally(() => { pending = null; });
  if (cache && cache.staleAt > now) { metrics.staleResponses += 1; return { ...cache.snapshot, cacheStatus:'stale' }; }
  return { ...(await pending), cacheStatus:'miss' };
}
