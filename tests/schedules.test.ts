import { describe, expect, it } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import { parseScheduleManifestPayload, parseSchedulePayload, scheduleAvailability, scheduleTimeToMinutes } from '@/lib/schedule-data';

const validPayload = {
  data: {
    schemaVersion: 1,
    routeId: 'ferry:165',
    timezone: 'Europe/Istanbul',
    source: {
      provider: 'sehir-hatlari',
      label: 'Şehir Hatları',
      url: 'https://sehirhatlari.istanbul/tr/seferler/ornek',
      retrievedAt: '2026-09-01T09:00:00.000Z',
      effectiveFrom: '2026-09-01',
      effectiveTo: '2026-12-31',
      validityUnknown: false,
    },
    dayTypes: [{ id: 'weekday', label: 'Hafta içi', weekdays: [1, 2, 3, 4, 5], publicHolidayPolicy: 'excluded' }],
    directions: [{
      directionId: 'outbound',
      name: 'Kadıköy → Beşiktaş',
      patterns: [{
        id: 'outbound-weekday',
        dayTypeId: 'weekday',
        notes: ['Resmî tatillerde uygulanmaz.'],
        journeys: [{
          id: 'outbound-1',
          calls: [
            { stopId: 'kadikoy', stopName: 'Kadıköy', time: '23:50' },
            { stopId: 'besiktas', stopName: 'Beşiktaş', time: '24:15' },
          ],
        }],
      }],
    }],
  },
  meta: { source: 'sehir-hatlari', status: 'static', fetchedAt: '2026-09-01T09:00:00.000Z' },
};

describe('schedule data contract', () => {
  it('keeps after-midnight transit times and validates a complete payload', () => {
    const parsed = parseSchedulePayload(validPayload);
    expect(parsed.data.directions[0]?.patterns[0]?.journeys[0]?.calls[1]?.time).toBe('24:15');
    expect(scheduleTimeToMinutes('24:15')).toBe(1455);
  });

  it('rejects a journey whose call times move backwards', () => {
    const invalid = structuredClone(validPayload);
    invalid.data.directions[0]!.patterns[0]!.journeys[0]!.calls[1]!.time = '22:15';
    expect(() => parseSchedulePayload(invalid)).toThrow(/geriye gidemez/);
  });

  it('rejects patterns that reference an unknown day type', () => {
    const invalid = structuredClone(validPayload);
    invalid.data.directions[0]!.patterns[0]!.dayTypeId = 'holiday';
    expect(() => parseSchedulePayload(invalid)).toThrow(/Bilinmeyen gün türü/);
  });

  it('classifies validity using the Istanbul calendar date', () => {
    const source = parseSchedulePayload(validPayload).data.source;
    expect(scheduleAvailability(source, new Date('2026-08-31T21:30:00.000Z'))).toBe('valid');
    expect(scheduleAvailability(source, new Date('2027-01-01T00:00:00.000Z'))).toBe('expired');
    expect(scheduleAvailability({ ...source, validityUnknown: true, effectiveFrom: undefined, effectiveTo: undefined })).toBe('unknown');
  });

  it('validates manifest counts and blocks paths outside the schedule directory', () => {
    const entry = { ...validPayload.data.source, path: '/schedules/routes/ferry%3A165.json' };
    const manifest = { data: { schemaVersion: 1, generatedAt: '2026-09-01T09:00:00.000Z', routes: { 'ferry:165': entry } }, meta: { source: 'build', status: 'static', routeCount: 1 } };
    expect(parseScheduleManifestPayload(manifest).data.routes['ferry:165']?.path).toContain('/schedules/routes/');
    expect(() => parseScheduleManifestPayload({ ...manifest, data: { ...manifest.data, routes: { 'ferry:165': { ...entry, path: '/../secret.json' } } } })).toThrow(/Güvensiz/);
  });

  it('publishes a validated and size-bounded schedule for every exposed ferry route', async () => {
    const manifest = parseScheduleManifestPayload(JSON.parse(await readFile(new URL('../public/schedules/manifest.json', import.meta.url), 'utf8')));
    const ferryIndex = JSON.parse(await readFile(new URL('../public/ferry/route-index.json', import.meta.url), 'utf8')) as { data:Array<{ id:string }> };
    expect(Object.keys(manifest.data.routes).sort()).toEqual(ferryIndex.data.map((route) => route.id).sort());
    expect(manifest.meta.routeCount).toBe(30);

    for (const [routeId, entry] of Object.entries(manifest.data.routes)) {
      const fileUrl = new URL(`../public${entry.path}`, import.meta.url);
      expect((await stat(fileUrl)).size).toBeLessThanOrEqual(100_000);
      const payload = parseSchedulePayload(JSON.parse(await readFile(fileUrl, 'utf8')));
      expect(payload.data.routeId).toBe(routeId);
      expect(payload.data.source.provider).toBe('sehir-hatlari');
      expect(payload.data.directions.map((direction) => direction.directionId).sort()).toEqual(['outbound', 'return']);
      expect(payload.data.directions.every((direction) => direction.patterns.some((pattern) => pattern.journeys.length > 0))).toBe(true);
    }
  });
});
