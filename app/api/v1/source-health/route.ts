import { getIettSourceHealth } from '@/lib/data-sources/iett';

export async function GET() {
  return Response.json({
    data: getIettSourceHealth(),
    meta: {
      fetchedAt: new Date().toISOString(),
      schemaVersion: 1,
    },
  });
}
