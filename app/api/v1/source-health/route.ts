import { getIettSourceHealth } from '@/lib/data-sources/iett';
import { getIettAnnouncementMetrics } from '@/lib/data-sources/iett-announcements';
import { getIettLiveVehicleMetrics } from '@/lib/data-sources/iett-live-vehicles';

export async function GET() {
  return Response.json({
    data: getIettSourceHealth(),
    metrics: {
      liveVehicles: getIettLiveVehicleMetrics(),
      announcements: getIettAnnouncementMetrics(),
    },
    meta: {
      fetchedAt: new Date().toISOString(),
      schemaVersion: 1,
    },
  });
}
