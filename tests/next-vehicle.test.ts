import { describe, expect, it } from 'vitest';
import { classifyVehicleStopRelation, vehicleStopRelationLabel } from '@/lib/next-vehicle';

describe('next vehicle stop relation', () => {
  it('distinguishes approaching, near and passed vehicles without producing ETA', () => {
    expect(classifyVehicleStopRelation({ nearSelectedStop: false, remainingMeters: 900 })).toBe('approaching');
    expect(classifyVehicleStopRelation({ nearSelectedStop: false, remainingMeters: 180 })).toBe('near');
    expect(classifyVehicleStopRelation({ nearSelectedStop: true, remainingMeters: 2_000 })).toBe('near');
    expect(classifyVehicleStopRelation({ nearSelectedStop: false, remainingMeters: -250 })).toBe('passed');
  });

  it('does not claim a status when projection data is unavailable', () => {
    expect(classifyVehicleStopRelation({ nearSelectedStop: false, remainingMeters: null })).toBe('unknown');
    expect(vehicleStopRelationLabel('unknown')).toBe('Konum doğrulanamadı');
  });
});
