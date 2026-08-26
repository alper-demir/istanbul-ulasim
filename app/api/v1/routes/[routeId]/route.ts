import { getIettRoute } from '@/lib/data-sources/iett-route-store';
import { routes } from '@/lib/transit-fixtures';

export async function GET(_request: Request, { params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await params;
  const route = await getIettRoute(decodeURIComponent(routeId)) ?? routes.find((item) => item.id === routeId);
  if (!route) return Response.json({ error: 'Hat bulunamadı' }, { status: 404 });
  return Response.json({
    data: route,
    meta: { source: route.id.startsWith('iett:') ? 'ibb-open-data' : 'fixture', fetchedAt: new Date().toISOString(), status: route.id.startsWith('iett:') ? 'static' : 'demo' },
  });
}
