import { routes } from '@/lib/transit-fixtures';
import { listIettRoutes } from '@/lib/data-sources/iett-route-store';

export async function GET() {
  const iettRoutes = await listIettRoutes();
  return Response.json({
    data: iettRoutes ?? routes.map(({ stops, vehicles, ...route }) => ({ ...route, vehicleCount: vehicles.length, stopCount: stops.length })),
    meta: {
      source: iettRoutes ? 'ibb-open-data' : 'fixture',
      fetchedAt: new Date().toISOString(),
      status: iettRoutes ? 'static' : 'demo',
      nextSource: 'ibb-iett-route-geometry',
    },
  });
}
