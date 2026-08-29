import { getIettLiveVehicles } from '@/lib/data-sources/iett-live-vehicles';

const ROUTE_CODE_PATTERN = /^[0-9A-ZÇĞİÖŞÜ-]{1,16}$/u;

export async function GET(request: Request) {
  const routeCode = new URL(request.url).searchParams.get('route')?.trim().toLocaleUpperCase('tr-TR') ?? '';
  if (!ROUTE_CODE_PATTERN.test(routeCode)) {
    return Response.json({ error:'Geçerli bir hat kodu gerekli' }, { status:400 });
  }

  try {
    const snapshot = await getIettLiveVehicles(routeCode);
    return Response.json({
      data:snapshot.vehicles,
      meta:{
        source:'ibb-iett-live',
        status:snapshot.cacheStatus === 'stale' ? 'stale' : 'live',
        cacheStatus:snapshot.cacheStatus,
        cacheTtlMs:snapshot.cacheTtlMs,
        fetchedAt:snapshot.fetchedAt,
        newestPositionAt:snapshot.newestPositionAt,
        discardedVehicleCount:snapshot.discardedVehicleCount,
      },
    }, {
      headers:{ 'Cache-Control':'public, max-age=15, stale-while-revalidate=45' },
    });
  } catch (error) {
    console.error('Live vehicle source failed', error);
    return Response.json({
      error:'Canlı araç verisi şu anda alınamıyor',
      meta:{ source:'ibb-iett-live', status:'unavailable', fetchedAt:new Date().toISOString() },
    }, { status:503, headers:{ 'Cache-Control':'no-store' } });
  }
}
