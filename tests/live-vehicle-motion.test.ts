import { describe, expect, it } from 'vitest';
import { interpolateCoordinate, projectCoordinateOnRoute, safeInterpolatedCoordinate } from '@/lib/live-vehicle-motion';

const route: [number, number][] = [[29, 41], [29.02, 41]];

describe('live vehicle map motion', () => {
  it('projects an interpolated marker onto the selected route', () => {
    const coordinate = safeInterpolatedCoordinate({
      from:[29.002, 41.001], to:[29.012, 40.999], route,
      fromUpdatedSecondsAgo:10, toUpdatedSecondsAgo:10, progress:0.5,
    });
    expect(coordinate?.[0]).toBeCloseTo(29.007);
    expect(coordinate?.[1]).toBe(41);
  });

  it('does not animate stale, implausibly large, or off-route source jumps', () => {
    expect(safeInterpolatedCoordinate({ from:[29, 41], to:[29.01, 41], route, fromUpdatedSecondsAgo:181, toUpdatedSecondsAgo:10, progress:0.5 })).toBeNull();
    expect(safeInterpolatedCoordinate({ from:[29, 41], to:[29.2, 41], route, fromUpdatedSecondsAgo:10, toUpdatedSecondsAgo:10, progress:0.5 })).toBeNull();
    expect(safeInterpolatedCoordinate({ from:[29, 41.03], to:[29.01, 41.03], route, fromUpdatedSecondsAgo:10, toUpdatedSecondsAgo:10, progress:0.5 })).toBeNull();
  });

  it('clamps interpolation and returns the nearest coordinate on a route', () => {
    expect(interpolateCoordinate([29, 41], [29.02, 41], 3)).toEqual([29.02, 41]);
    expect(projectCoordinateOnRoute([29.01, 41.002], route)).toMatchObject({ coordinate:[29.01, 41] });
  });
});
