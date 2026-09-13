import { getIettSourceHealth } from '@/lib/data-sources/iett';
import { getIettAnnouncementMetrics } from '@/lib/data-sources/iett-announcements';
import { getIettLiveVehicleMetrics } from '@/lib/data-sources/iett-live-vehicles';
import { getMetroAnnouncementMetrics } from '@/lib/data-sources/metro-announcements';
import { getSehirHatlariAnnouncementMetrics } from '@/lib/data-sources/sehir-hatlari-announcements';
import { getMarmarayAnnouncementMetrics } from '@/lib/data-sources/marmaray-announcements';
import { runtimeSourceHealth, sourceOperationalStatus } from '@/lib/source-observability';

export async function GET(request: Request) {
  const liveVehicles = getIettLiveVehicleMetrics();
  const announcements = getIettAnnouncementMetrics();
  const metroAnnouncements = getMetroAnnouncementMetrics();
  const sehirHatlariAnnouncements = getSehirHatlariAnnouncementMetrics();
  const marmarayAnnouncements = getMarmarayAnnouncementMetrics();
  const runtimeBySource = new Map([
    ['ibb-iett-vehicle-positions', runtimeSourceHealth(liveVehicles)],
    ['ibb-iett-announcements', runtimeSourceHealth(announcements)],
    ['metro-istanbul-announcements', runtimeSourceHealth(metroAnnouncements)],
    ['sehir-hatlari-announcements', runtimeSourceHealth(sehirHatlariAnnouncements)],
    ['marmaray-tcdd-announcements', runtimeSourceHealth(marmarayAnnouncements)],
  ]);
  const data = getIettSourceHealth().map((source) => ({ ...source, runtime: runtimeBySource.get(source.id) ?? null }));
  const statuses = [sourceOperationalStatus(liveVehicles), sourceOperationalStatus(announcements), sourceOperationalStatus(metroAnnouncements), sourceOperationalStatus(sehirHatlariAnnouncements), sourceOperationalStatus(marmarayAnnouncements)];
  const status = statuses.includes('unavailable') ? 'unavailable' : statuses.includes('unknown') ? 'unknown' : 'operational';
  const monitor = new URL(request.url).searchParams.get('monitor') === '1';
  const response = Response.json({
    status,
    data,
    metrics: {
      liveVehicles,
      announcements,
      metroAnnouncements,
      sehirHatlariAnnouncements,
      marmarayAnnouncements,
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
