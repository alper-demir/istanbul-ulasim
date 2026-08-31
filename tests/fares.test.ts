import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { fareLabelForRoute, istanbulFareCatalog, resolveFare } from '@/lib/fare-data';

describe('İstanbulkart fare catalog', () => {
  it('has a dated official source and valid profile references', () => {
    expect(istanbulFareCatalog.schemaVersion).toBe(1);
    expect(istanbulFareCatalog.effectiveFrom).toBe('2026-07-20');
    expect(istanbulFareCatalog.sources.some((source) => source.id === 'tuhim-2026-07-20')).toBe(true);
    expect(istanbulFareCatalog.profiles.every((profile) => profile.sourceId)).toBe(true);
  });

  it('keeps route-specific and distance-based rules distinct', () => {
    expect(resolveFare('iett:500T')).toMatchObject({ id: 'iett-two-ticket', verification: 'route-verified', subscriptionLimit: 2 });
    expect(resolveFare('metro:M11')).toMatchObject({ id: 'm11-distance', kind: 'distance-bands' });
    expect(resolveFare('rail:B1')).toMatchObject({ id: 'marmaray-distance', kind: 'distance-bands' });
    expect(resolveFare('ferry:2024')).toMatchObject({ id: 'ferry-bostanci-karakoy', verification: 'route-verified' });
    expect(resolveFare('ferry:169')).toMatchObject({ id: 'ferry-distance', verification: 'general-only' });
    expect(fareLabelForRoute('iett:11C')).toBe('Genel ilk biniş tarifesi');
  });

  it('publishes the generated catalog without losing its source metadata', async () => {
    const payload = JSON.parse(await readFile(new URL('../public/fares/current.json', import.meta.url), 'utf8')) as { data: typeof istanbulFareCatalog; meta: { status: string } };
    expect(payload.meta.status).toBe('static');
    expect(payload.data.id).toBe(istanbulFareCatalog.id);
    expect(payload.data.routeProfiles['iett:500T']?.profileId).toBe('iett-two-ticket');
  });
});
