import { routes } from '@/lib/transit-fixtures';

export async function GET() {
  return Response.json({
    data: routes,
    meta: {
      source: 'fixture',
      fetchedAt: new Date().toISOString(),
      status: 'demo',
      nextSource: 'ibb-iett-route-geometry',
    },
  });
}
