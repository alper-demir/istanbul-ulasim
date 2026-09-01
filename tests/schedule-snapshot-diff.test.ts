import { describe, expect, it } from 'vitest';
import { diffScheduleManifests } from '../scripts/schedule-snapshot-diff.mjs';

const manifest = (routes: Record<string, object>, generatedAt = '2026-09-01T00:00:00.000Z') => ({ data: { generatedAt, routes } });
const entry = (overrides: Record<string, unknown> = {}) => ({ provider: 'metro-istanbul', url: 'https://metro.istanbul/example', validityUnknown: true, ...overrides });

describe('schedule snapshot diff', () => {
  it('reports added, removed, and source-validity changes for review', () => {
    const report = diffScheduleManifests(
      manifest({ 'metro:M2': entry(), 'metro:M4': entry() }),
      manifest({ 'metro:M2': entry({ effectiveTo: '2026-12-31', validityUnknown: false }), 'metro:M5': entry() }, '2026-09-02T00:00:00.000Z'),
    );
    expect(report.addedRoutes).toEqual(['metro:M5']);
    expect(report.removedRoutes).toEqual(['metro:M4']);
    expect(report.changedSources).toHaveLength(1);
    expect(report.requiresReview).toBe(true);
  });

  it('does not require review for identical manifests', () => {
    const before = manifest({ 'metro:M2': entry() });
    expect(diffScheduleManifests(before, structuredClone(before)).requiresReview).toBe(false);
  });
});
