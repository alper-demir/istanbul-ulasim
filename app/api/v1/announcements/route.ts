import { getIettAnnouncements } from '@/lib/data-sources/iett-announcements';
import { getMetroAnnouncements } from '@/lib/data-sources/metro-announcements';
import { getSehirHatlariAnnouncements } from '@/lib/data-sources/sehir-hatlari-announcements';
import { createFixedWindowRateLimiter, getClientIdentifier } from '@/lib/rate-limit';

const ROUTE_CODE_PATTERN = /^[0-9A-ZÇĞİÖŞÜ-]{1,16}$/u;
const requestLimiter = createFixedWindowRateLimiter(120, 60_000);

export async function GET(request: Request) {
  const rateLimit = requestLimiter.check(getClientIdentifier(request.headers));
  const rateLimitHeaders = {
    'RateLimit-Limit': '120',
    'RateLimit-Remaining': String(rateLimit.remaining),
    'RateLimit-Reset': String(rateLimit.retryAfterSeconds),
  };
  if (!rateLimit.allowed) {
    return Response.json(
      { error: 'Çok fazla duyuru isteği gönderildi; biraz sonra tekrar deneyin.' },
      { status: 429, headers: { ...rateLimitHeaders, 'Retry-After': String(rateLimit.retryAfterSeconds), 'Cache-Control': 'no-store' } },
    );
  }
  const route = new URL(request.url).searchParams.get('route')?.trim().toLocaleUpperCase('tr-TR') ?? null;
  if (route && !ROUTE_CODE_PATTERN.test(route)) return Response.json({ error: 'Geçerli bir hat kodu gerekli' }, { status: 400 });
  try {
    const results = await Promise.allSettled([getIettAnnouncements(), getMetroAnnouncements(), getSehirHatlariAnnouncements()]);
    type AnnouncementSnapshot = { announcements:Array<{ routeCodes:string[]; provider:string }>; cacheStatus:'miss'|'hit'|'stale' };
    const snapshots = results.flatMap((result):AnnouncementSnapshot[] => result.status === 'fulfilled' ? [{ announcements:result.value.announcements, cacheStatus:result.value.cacheStatus }] : []);
    if (!snapshots.length) throw new Error('Duyuru kaynaklarının tamamı kullanılamıyor');
    const data = snapshots.flatMap((snapshot) => snapshot.announcements).filter((item) => !route || item.routeCodes.includes(route) || item.routeCodes.length === 0);
    const failedCount = results.filter((result) => result.status === 'rejected').length;
    const cacheStatus = snapshots.some((snapshot) => snapshot.cacheStatus === 'stale') ? 'stale' : snapshots.every((snapshot) => snapshot.cacheStatus === 'hit') ? 'hit' : 'miss';
    const status = failedCount ? 'partial' : cacheStatus === 'stale' ? 'stale' : 'live';
    return Response.json({ data, meta: { source: 'multi-provider-announcements', status, cacheStatus, fetchedAt: new Date().toISOString(), sources: snapshots.map((snapshot) => ({ provider: snapshot.announcements[0]?.provider ?? 'unknown', status: snapshot.cacheStatus })) } }, { headers: { ...rateLimitHeaders, 'Cache-Control': 'public, max-age=0, s-maxage=120, stale-while-revalidate=300, stale-if-error=1800', 'X-Announcements-Cache': cacheStatus } });
  } catch (error) {
    console.error('IETT announcement source failed', error);
    return Response.json({ error: 'Duyurular şu anda alınamıyor', meta: { source: 'ibb-iett-announcements', status: 'unavailable', fetchedAt: new Date().toISOString() } }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
