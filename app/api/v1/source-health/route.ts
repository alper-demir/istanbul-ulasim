import { getIettSourceHealth } from '@/lib/data-sources/iett';
import { getIettAnnouncementMetrics } from '@/lib/data-sources/iett-announcements';
import { getIettLiveVehicleMetrics } from '@/lib/data-sources/iett-live-vehicles';
import { runtimeSourceHealth, sourceOperationalStatus } from '@/lib/source-observability';

export async function GET(request: Request) {
  const liveVehicles = getIettLiveVehicleMetrics();
  const announcements = getIettAnnouncementMetrics();
  const runtimeBySource = new Map([
    ['ibb-iett-vehicle-positions', runtimeSourceHealth(liveVehicles)],
    ['ibb-iett-announcements', runtimeSourceHealth(announcements)],
  ]);
  const data = getIettSourceHealth().map((source) => ({ ...source, runtime: runtimeBySource.get(source.id) ?? null }));
  const statuses = [sourceOperationalStatus(liveVehicles), sourceOperationalStatus(announcements)];
  const status = statuses.includes('unavailable') ? 'unavailable' : statuses.includes('unknown') ? 'unknown' : 'operational';
  const monitor = new URL(request.url).searchParams.get('monitor') === '1';
  const response = Response.json({
    status,
    data,
    metrics: {
      liveVehicles,
      announcements,
    },
    meta: {
      fetchedAt: new Date().toISOString(),
      schemaVersion: 1,
    },
  }, { status: monitor && status === 'unavailable' ? 503 : 200 });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Source-Health', status);
  if (monitor && status === 'unavailable') {
    response.headers.set('X-Source-Health-Alert', 'unavailable');
  }
  return response;
}
