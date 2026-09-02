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

  it('preserves a compact first/last movement summary', () => {
    const payload = { ...structuredClone(validPayload), data: { ...structuredClone(validPayload).data, summary: 'first-last' } };
    expect(parseSchedulePayload(payload).data.summary).toBe('first-last');
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
    const ferryRouteIds = ferryIndex.data.map((route) => route.id).sort();
    expect(ferryRouteIds.every((routeId) => routeId in manifest.data.routes)).toBe(true);
    expect(manifest.meta.routeCount).toBeGreaterThanOrEqual(ferryRouteIds.length);

    for (const routeId of ferryRouteIds) {
      const entry = manifest.data.routes[routeId]!;
      const fileUrl = new URL(`../public${entry.path}`, import.meta.url);
      expect((await stat(fileUrl)).size).toBeLessThanOrEqual(100_000);
      const payload = parseSchedulePayload(JSON.parse(await readFile(fileUrl, 'utf8')));
      expect(payload.data.routeId).toBe(routeId);
      expect(payload.data.source.provider).toBe('sehir-hatlari');
      expect(payload.data.directions.map((direction) => direction.directionId).sort()).toEqual(['outbound', 'return']);
      expect(payload.data.directions.every((direction) => direction.patterns.some((pattern) => pattern.journeys.length > 0))).toBe(true);
      const routePayload = JSON.parse(await readFile(new URL(`../public/ferry/routes/${routeId.replace('ferry:', '')}.json`, import.meta.url), 'utf8')) as { data:{ directions:Array<{ id:string; stops:Array<{ id:string }> }> } };
      for (const scheduleDirection of payload.data.directions) {
        const routeDirection = routePayload.data.directions.find((direction) => direction.id === scheduleDirection.directionId);
        const stopIds = new Set(routeDirection?.stops.map((stop) => stop.id));
        expect(routeDirection, `${routeId}/${scheduleDirection.directionId} yönü statik rotada bulunmalı`).toBeDefined();
        for (const pattern of scheduleDirection.patterns) {
          for (const journey of pattern.journeys) {
            expect(journey.calls.every((call) => stopIds.has(call.stopId)), `${routeId}/${journey.id} yalnız rota iskelelerini kullanmalı`).toBe(true);
          }
        }
      }
    }
  });

  it('publishes a validated IETT snapshot only for the route explicitly captured from the official page', async () => {
    const payload = parseSchedulePayload(JSON.parse(await readFile(new URL('../public/schedules/routes/iett-500T.json', import.meta.url), 'utf8')));
    expect(payload.data.routeId).toBe('iett:500T');
    expect(payload.data.source.provider).toBe('iett');
    expect(payload.data.directions.map((direction) => direction.directionId).sort()).toEqual(['outbound', 'return']);
    expect(payload.data.dayTypes.map((dayType) => dayType.id).sort()).toEqual(['saturday', 'sunday', 'weekday']);
    expect(payload.data.directions.every((direction) => direction.patterns.every((pattern) => pattern.journeys.length > 0))).toBe(true);
  });

  it('publishes compact first/last movement summaries for every verified Metro İstanbul line', async () => {
    for (const code of ['M1A', 'M1B', 'M2', 'M3', 'M4', 'M5', 'M6', 'M8', 'M9', 'T1', 'T3', 'T4', 'T5', 'F1', 'F4']) {
      const network = code.startsWith('M') ? 'metro' : 'rail';
      const payload = parseSchedulePayload(JSON.parse(await readFile(new URL(`../public/schedules/routes/${network}-${code}.json`, import.meta.url), 'utf8')));
      expect(payload.data.routeId).toBe(`${network}:${code}`);
      expect(payload.data.source.provider).toBe('metro-istanbul');
      expect(payload.data.summary).toBe('first-last');
      expect(payload.data.directions.every((direction) => direction.patterns[0]?.journeys.length === 2)).toBe(true);
      const route = JSON.parse(await readFile(new URL(`../public/${network}/routes/${code}.json`, import.meta.url), 'utf8')) as { data: { directions: Array<{ id: string; stops: Array<{ id: string }> }> } };
      for (const direction of payload.data.directions) {
        const routeDirection = route.data.directions.find((candidate) => candidate.id === direction.directionId);
        expect(routeDirection, `${code}/${direction.directionId} yönü statik rotada bulunmalı`).toBeDefined();
        const stopIds = new Set(routeDirection?.stops.map((stop) => stop.id));
        expect(direction.patterns[0]?.journeys.every((journey) => journey.calls.every((call) => stopIds.has(call.stopId))), `${code}/${direction.directionId} özet kalkışları rota duraklarına bağlı olmalı`).toBe(true);
      }
    }
  });
});
