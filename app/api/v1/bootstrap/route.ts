import { getIettSourceHealth } from '@/lib/data-sources/iett';

export async function GET() {
  const sourceHealth = getIettSourceHealth();
  return Response.json({
    data: {
      city: 'İstanbul',
      center: [29.01, 41.035],
      defaultZoom: 9.6,
      refreshIntervalMs: 30_000,
      features: {
        liveVehicles: sourceHealth.some((source) => source.kind === 'live-vehicles' && source.status === 'ready-to-import'),
        traffic: false,
        favorites: true,
      },
    },
    meta: {
      source: 'fixture',
      sourceHealth,
      fetchedAt: new Date().toISOString(),
    },
  });
}
