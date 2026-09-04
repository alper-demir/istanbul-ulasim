import { getIettAnnouncements } from '@/lib/data-sources/iett-announcements';
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
    const snapshot = await getIettAnnouncements();
    const data = route ? snapshot.announcements.filter((item) => item.routeCodes.includes(route) || item.routeCodes.length === 0) : snapshot.announcements;
    return Response.json({ data, meta: { source: 'ibb-iett-announcements', status: snapshot.cacheStatus === 'stale' ? 'stale' : 'live', cacheStatus: snapshot.cacheStatus, fetchedAt: snapshot.fetchedAt } }, { headers: { ...rateLimitHeaders, 'Cache-Control': 'public, max-age=0, s-maxage=120, stale-while-revalidate=300, stale-if-error=1800', 'X-Announcements-Cache': snapshot.cacheStatus } });
  } catch (error) {
    console.error('IETT announcement source failed', error);
    return Response.json({ error: 'Duyurular şu anda alınamıyor', meta: { source: 'ibb-iett-announcements', status: 'unavailable', fetchedAt: new Date().toISOString() } }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
