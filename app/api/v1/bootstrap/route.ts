export async function GET() {
  return Response.json({
    data: {
      city: 'İstanbul',
      center: [29.01, 41.035],
      defaultZoom: 9.6,
      refreshIntervalMs: 30_000,
      features: {
        liveVehicles: false,
        traffic: false,
        favorites: true,
      },
    },
    meta: {
      source: 'fixture',
      fetchedAt: new Date().toISOString(),
    },
  });
}
