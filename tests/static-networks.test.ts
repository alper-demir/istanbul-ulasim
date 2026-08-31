import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

type RouteSummary = {
  id: string;
  code: string;
  mode: string;
  sourceUrl: string;
  sourceUpdatedAt: string;
  supportsLiveVehicles: boolean;
  stopCount: number;
  geometrySource?: string;
};

type RouteIndex = {
  data: RouteSummary[];
  meta: Record<string, unknown>;
};

async function readJson<T>(path: string) {
  return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8')) as T;
}

async function expectRouteFiles(network: 'rail' | 'ferry', routes: RouteSummary[]) {
  for (const summary of routes) {
    const routeId = summary.id.split(':')[1];
    const payload = await readJson<{ data: {
      id: string;
      coordinates: [number, number][];
      stops: Array<{ coordinates: [number, number] }>;
      directions: Array<{ coordinates: [number, number][]; stops: unknown[] }>;
    } }>(`public/${network}/routes/${routeId}.json`);

    expect(payload.data.id).toBe(summary.id);
    expect(payload.data.stops).toHaveLength(summary.stopCount);
    expect(payload.data.directions.length).toBeGreaterThanOrEqual(1);
    expect(payload.data.coordinates.length).toBeGreaterThanOrEqual(2);
    if (network === 'ferry') {
      for (const direction of payload.data.directions) {
        expect(direction.coordinates.length).toBeGreaterThanOrEqual(direction.stops.length);
        for (const stop of direction.stops as Array<{ coordinates: [number, number] }>) {
          expect(direction.coordinates).toContainEqual(stop.coordinates);
        }
      }
    }
    for (const [longitude, latitude] of payload.data.stops.map((stop) => stop.coordinates)) {
      expect(longitude).toBeGreaterThan(27.5);
      expect(longitude).toBeLessThan(30.5);
      expect(latitude).toBeGreaterThan(40.5);
      expect(latitude).toBeLessThan(41.5);
    }
  }
}

describe('static transit networks', () => {
  it('publishes the selected tram, funicular and Marmaray lines', async () => {
    const index = await readJson<RouteIndex>('public/rail/route-index.json');
    expect(index.data.map((route) => route.code)).toEqual(['B1', 'F1', 'F4', 'T1', 'T3', 'T4', 'T5']);
    expect(index.data.map((route) => route.mode)).not.toContain('Teleferik');
    expect(index.data.every((route) => route.sourceUrl && route.sourceUpdatedAt && !route.supportsLiveVehicles)).toBe(true);
    expect(index.data.find((route) => route.code === 'B1')?.stopCount).toBe(43);
    expect(index.data.find((route) => route.code === 'T4')?.stopCount).toBe(22);
    await expectRouteFiles('rail', index.data);
  });

  it('publishes a complete Şehir Hatları pier catalog with validated geometry metadata', async () => {
    const index = await readJson<RouteIndex>('public/ferry/route-index.json');
    const stops = await readJson<{ data: unknown[]; meta: { unlocatedPierCount: number } }>('public/ferry/stop-index.json');
    expect(index.data).toHaveLength(31);
    expect(index.data.every((route) => route.mode === 'Vapur' && route.stopCount >= 2)).toBe(true);
    expect(new Set(index.data.map((route) => route.id)).size).toBe(index.data.length);
    expect(stops.data).toHaveLength(44);
    expect(stops.meta.unlocatedPierCount).toBe(0);
    expect(index.meta.geometry).toBe('ibb-gtfs-shape-with-schematic-fallback');
    expect(index.meta.geometrySource).toContain('İBB Açık Veri GTFS');
    expect(index.meta.geometrySourceUpdatedAt).toBe('2024-03-13');
    expect(index.data.some((route) => route.geometrySource?.includes('GTFS'))).toBe(true);
    await expectRouteFiles('ferry', index.data);
  });
});
