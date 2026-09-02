export type ScheduleAvailability = 'valid' | 'future' | 'expired' | 'unknown';

export type ScheduleSource = {
  provider: string;
  label: string;
  url: string;
  retrievedAt: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  validityUnknown: boolean;
};

export type ScheduleDayType = {
  id: string;
  label: string;
  weekdays?: number[];
  publicHolidayPolicy?: 'included' | 'excluded' | 'separate' | 'unknown';
};

export type ScheduleCall = {
  stopId: string;
  stopName: string;
  time: string;
  marker?: string;
};

export type ScheduleJourney = {
  id: string;
  calls: ScheduleCall[];
};

export type ScheduleServicePattern = {
  id: string;
  dayTypeId: string;
  notes: string[];
  journeys: ScheduleJourney[];
};

export type ScheduleDirection = {
  directionId: string;
  name: string;
  patterns: ScheduleServicePattern[];
};

export type ScheduleDataset = {
  schemaVersion: 1;
  routeId: string;
  timezone: 'Europe/Istanbul';
  source: ScheduleSource;
  dayTypes: ScheduleDayType[];
  directions: ScheduleDirection[];
  summary?: 'first-last';
};

export type SchedulePayload = {
  data: ScheduleDataset;
  meta: {
    source: string;
    status: 'static';
    fetchedAt: string;
  };
};

export type ScheduleManifestEntry = Pick<ScheduleSource, 'provider' | 'label' | 'url' | 'retrievedAt' | 'effectiveFrom' | 'effectiveTo' | 'validityUnknown'> & {
  path: string;
};

export type ScheduleManifest = {
  schemaVersion: 1;
  generatedAt: string;
  routes: Record<string, ScheduleManifestEntry>;
};

export type ScheduleManifestPayload = {
  data: ScheduleManifest;
  meta: {
    source: string;
    status: 'static';
    routeCount: number;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown, field: string) {
  if (!isRecord(value)) throw new Error(`${field} nesne olmalı`);
  return value;
}

function requireString(record: Record<string, unknown>, field: string) {
  const value = record[field];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} boş olmayan metin olmalı`);
  return value.trim();
}

function optionalString(record: Record<string, unknown>, field: string) {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} metin olmalı`);
  return value.trim();
}

function requireArray(value: unknown, field: string) {
  if (!Array.isArray(value)) throw new Error(`${field} dizi olmalı`);
  return value;
}

function assertIsoDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${field} YYYY-MM-DD biçiminde olmalı`);
  }
}

function assertIsoTimestamp(value: string, field: string) {
  if (Number.isNaN(Date.parse(value))) throw new Error(`${field} geçerli ISO tarih-saat olmalı`);
}

export function scheduleTimeToMinutes(value: string) {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value);
  if (!match) throw new Error(`Geçersiz sefer saati: ${value}`);
  const hour = Number(match[1]);
  if (hour > 99) throw new Error(`Sefer saati 99:59 değerini aşamaz: ${value}`);
  return hour * 60 + Number(match[2]);
}

function parseSource(value: unknown): ScheduleSource {
  const source = requireRecord(value, 'source');
  const url = requireString(source, 'url');
  if (!/^https:\/\//i.test(url)) throw new Error('source.url HTTPS olmalı');
  const retrievedAt = requireString(source, 'retrievedAt');
  assertIsoTimestamp(retrievedAt, 'source.retrievedAt');
  const effectiveFrom = optionalString(source, 'effectiveFrom');
  const effectiveTo = optionalString(source, 'effectiveTo');
  if (effectiveFrom) assertIsoDate(effectiveFrom, 'source.effectiveFrom');
  if (effectiveTo) assertIsoDate(effectiveTo, 'source.effectiveTo');
  if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) throw new Error('Kaynak geçerlilik aralığı ters olamaz');
  if (typeof source.validityUnknown !== 'boolean') throw new Error('source.validityUnknown boolean olmalı');
  if (!source.validityUnknown && (!effectiveFrom || !effectiveTo)) {
    throw new Error('Geçerliliği bilinen kaynakta başlangıç ve bitiş tarihleri zorunludur');
  }
  return {
    provider: requireString(source, 'provider'),
    label: requireString(source, 'label'),
    url,
    retrievedAt,
    ...(effectiveFrom ? { effectiveFrom } : {}),
    ...(effectiveTo ? { effectiveTo } : {}),
    validityUnknown: source.validityUnknown,
  };
}

function uniqueId(id: string, ids: Set<string>, field: string) {
  if (ids.has(id)) throw new Error(`${field} tekrarlanamaz: ${id}`);
  ids.add(id);
}

export function parseSchedulePayload(value: unknown): SchedulePayload {
  const payload = requireRecord(value, 'payload');
  const data = requireRecord(payload.data, 'data');
  if (data.schemaVersion !== 1) throw new Error('Desteklenmeyen sefer şema sürümü');
  if (data.timezone !== 'Europe/Istanbul') throw new Error('Sefer saat dilimi Europe/Istanbul olmalı');

  const dayTypeIds = new Set<string>();
  const dayTypes = requireArray(data.dayTypes, 'dayTypes').map((item, index): ScheduleDayType => {
    const dayType = requireRecord(item, `dayTypes[${index}]`);
    const id = requireString(dayType, 'id');
    uniqueId(id, dayTypeIds, 'Gün türü kimliği');
    const weekdays = dayType.weekdays === undefined
      ? undefined
      : requireArray(dayType.weekdays, `dayTypes[${index}].weekdays`).map((weekday) => {
          if (!Number.isInteger(weekday) || Number(weekday) < 1 || Number(weekday) > 7) throw new Error('Hafta günü 1–7 arasında olmalı');
          return Number(weekday);
        });
    const publicHolidayPolicy = dayType.publicHolidayPolicy;
    if (publicHolidayPolicy !== undefined && !['included', 'excluded', 'separate', 'unknown'].includes(String(publicHolidayPolicy))) {
      throw new Error('Geçersiz resmî tatil politikası');
    }
    return {
      id,
      label: requireString(dayType, 'label'),
      ...(weekdays ? { weekdays } : {}),
      ...(publicHolidayPolicy ? { publicHolidayPolicy: publicHolidayPolicy as ScheduleDayType['publicHolidayPolicy'] } : {}),
    };
  });
  if (!dayTypes.length) throw new Error('En az bir gün türü gerekli');

  const directionIds = new Set<string>();
  const directions = requireArray(data.directions, 'directions').map((item, directionIndex): ScheduleDirection => {
    const direction = requireRecord(item, `directions[${directionIndex}]`);
    const directionId = requireString(direction, 'directionId');
    uniqueId(directionId, directionIds, 'Yön kimliği');
    const patternIds = new Set<string>();
    const patterns = requireArray(direction.patterns, `directions[${directionIndex}].patterns`).map((patternItem, patternIndex): ScheduleServicePattern => {
      const pattern = requireRecord(patternItem, `patterns[${patternIndex}]`);
      const id = requireString(pattern, 'id');
      uniqueId(id, patternIds, 'Sefer deseni kimliği');
      const dayTypeId = requireString(pattern, 'dayTypeId');
      if (!dayTypeIds.has(dayTypeId)) throw new Error(`Bilinmeyen gün türü: ${dayTypeId}`);
      const notes = requireArray(pattern.notes, 'notes').map((note) => {
        if (typeof note !== 'string' || !note.trim()) throw new Error('Sefer notu boş olmayan metin olmalı');
        return note.trim();
      });
      const journeyIds = new Set<string>();
      const journeys = requireArray(pattern.journeys, 'journeys').map((journeyItem, journeyIndex): ScheduleJourney => {
        const journey = requireRecord(journeyItem, `journeys[${journeyIndex}]`);
        const journeyId = requireString(journey, 'id');
        uniqueId(journeyId, journeyIds, 'Sefer kimliği');
        let previousMinutes = -1;
        const calls = requireArray(journey.calls, 'calls').map((callItem, callIndex): ScheduleCall => {
          const call = requireRecord(callItem, `calls[${callIndex}]`);
          const time = requireString(call, 'time');
          const minutes = scheduleTimeToMinutes(time);
          if (minutes < previousMinutes) throw new Error(`Sefer saatleri geriye gidemez: ${journeyId}`);
          previousMinutes = minutes;
          const marker = optionalString(call, 'marker');
          return {
            stopId: requireString(call, 'stopId'),
            stopName: requireString(call, 'stopName'),
            time,
            ...(marker ? { marker } : {}),
          };
        });
        if (!calls.length) throw new Error(`Sefer en az bir durak saati içermeli: ${journeyId}`);
        return { id: journeyId, calls };
      });
      return { id, dayTypeId, notes, journeys };
    });
    return { directionId, name: requireString(direction, 'name'), patterns };
  });
  if (!directions.length) throw new Error('En az bir sefer yönü gerekli');
  const summary = data.summary;
  if (summary !== undefined && summary !== 'first-last') throw new Error('Desteklenmeyen sefer özeti');

  const meta = requireRecord(payload.meta, 'meta');
  const fetchedAt = requireString(meta, 'fetchedAt');
  assertIsoTimestamp(fetchedAt, 'meta.fetchedAt');
  if (meta.status !== 'static') throw new Error('Sefer payload durumu static olmalı');

  return {
    data: {
      schemaVersion: 1,
      routeId: requireString(data, 'routeId'),
      timezone: 'Europe/Istanbul',
      source: parseSource(data.source),
      dayTypes,
      directions,
      ...(summary ? { summary } : {}),
    },
    meta: { source: requireString(meta, 'source'), status: 'static', fetchedAt },
  };
}

function parseManifestEntry(value: unknown): ScheduleManifestEntry {
  const entry = requireRecord(value, 'manifest route');
  const path = requireString(entry, 'path');
  if (!path.startsWith('/schedules/routes/') || path.includes('..') || !path.endsWith('.json')) throw new Error('Güvensiz sefer dosyası yolu');
  const source = parseSource(entry);
  return { path, ...source };
}

export function parseScheduleManifestPayload(value: unknown): ScheduleManifestPayload {
  const payload = requireRecord(value, 'manifest payload');
  const data = requireRecord(payload.data, 'manifest data');
  if (data.schemaVersion !== 1) throw new Error('Desteklenmeyen manifest şema sürümü');
  const generatedAt = requireString(data, 'generatedAt');
  assertIsoTimestamp(generatedAt, 'manifest.generatedAt');
  const routesRecord = requireRecord(data.routes, 'manifest routes');
  const routes = Object.fromEntries(Object.entries(routesRecord).map(([routeId, entry]) => [routeId, parseManifestEntry(entry)]));
  const meta = requireRecord(payload.meta, 'manifest meta');
  if (meta.status !== 'static') throw new Error('Manifest durumu static olmalı');
  if (!Number.isInteger(meta.routeCount) || Number(meta.routeCount) !== Object.keys(routes).length) throw new Error('Manifest hat sayısı tutarsız');
  return {
    data: { schemaVersion: 1, generatedAt, routes },
    meta: { source: requireString(meta, 'source'), status: 'static', routeCount: Number(meta.routeCount) },
  };
}

export function istanbulDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function scheduleAvailability(source: ScheduleSource, now = new Date()): ScheduleAvailability {
  if (source.validityUnknown || !source.effectiveFrom || !source.effectiveTo) return 'unknown';
  const today = istanbulDate(now);
  if (today < source.effectiveFrom) return 'future';
  if (today > source.effectiveTo) return 'expired';
  return 'valid';
}
