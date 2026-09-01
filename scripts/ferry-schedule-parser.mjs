const entityMap = {
  amp: '&', apos: "'", quot: '"', nbsp: ' ',
  Ccedil: 'Ç', ccedil: 'ç', Gbreve: 'Ğ', gbreve: 'ğ',
  Idot: 'İ', inodot: 'ı', Ouml: 'Ö', ouml: 'ö',
  Scedil: 'Ş', scedil: 'ş', Uuml: 'Ü', uuml: 'ü',
};

export function decodeHtml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (match, entity) => entityMap[entity] ?? match);
}

export function cleanHtmlText(value) {
  return decodeHtml(value.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  return value.toLocaleUpperCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/İ/g, 'I').replace(/\([^)]*\)/g, ' ')
    .replace(/\bA\s*\.?\s*HISARI\b/g, 'ANADOLU HISARI')
    .replace(/\bA\s*\.?\s*KAVAGI\b/g, 'ANADOLU KAVAGI')
    .replace(/\bR\s*\.?\s*KAVAGI\b/g, 'RUMELI KAVAGI')
    .replace(/\bANADOLUKAVAGI\b/g, 'ANADOLU KAVAGI')
    .replace(/\bRUMELIKAVAGI\b/g, 'RUMELI KAVAGI')
    .replace(/[^A-Z0-9]+/g, ' ').trim();
}

function slug(value) {
  return normalize(value).toLocaleLowerCase('en-US').replace(/\s+/g, '-');
}

function parseRows(tableHtml) {
  return [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => (
    [...row[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map((cell) => cleanHtmlText(cell[1]))
  )).filter((row) => row.length);
}

function parseDayDescriptor(value) {
  const baseLabel = value.split('*')[0].trim() || value;
  const normalized = normalize(baseLabel);
  let id = `published-${slug(value).slice(0, 48)}`;
  let label = baseLabel;
  let weekdays;
  let publicHolidayPolicy = 'unknown';

  if (normalized.includes('HER GUN') || normalized.includes('HERGUN')) {
    id = 'daily'; label = 'Her gün'; weekdays = [1, 2, 3, 4, 5, 6, 7]; publicHolidayPolicy = 'included';
  } else if (normalized.includes('HAFTA ICI VE CUMARTESI') || normalized.includes('HAFTAICI VE CUMARTESI')) {
    id = 'weekday-saturday'; label = 'Hafta içi ve Cumartesi'; weekdays = [1, 2, 3, 4, 5, 6]; publicHolidayPolicy = 'excluded';
  } else if (normalized.includes('PAZAR') && (normalized.includes('TATIL') || normalized.includes('RESMI'))) {
    id = 'sunday-holiday'; label = 'Pazar ve tatil günleri'; weekdays = [7]; publicHolidayPolicy = 'included';
  } else if (normalized.includes('CUMARTESI')) {
    id = 'saturday'; label = 'Cumartesi'; weekdays = [6]; publicHolidayPolicy = 'excluded';
  } else if (normalized.includes('HAFTA ICI') || normalized.includes('HAFTAICI')) {
    id = 'weekday'; label = 'Hafta içi'; weekdays = [1, 2, 3, 4, 5]; publicHolidayPolicy = 'excluded';
  } else if (normalized.includes('PAZAR')) {
    id = 'sunday'; label = 'Pazar'; weekdays = [7]; publicHolidayPolicy = 'unknown';
  }

  const notes = [...value.matchAll(/(\*+)\s*([^*]+?)(?=\s*\*+|$)/g)]
    .map((match) => `${match[1]} ${match[2].trim()}`)
    .filter((note) => note.length > 2);
  return { id, label, ...(weekdays ? { weekdays } : {}), publicHolidayPolicy, notes };
}

function timeCell(value) {
  const match = /^(\d{1,2}):([0-5]\d)(?:\s*(.*))?$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  return { minutes: hour * 60 + Number(match[2]), marker: match[3]?.trim() || undefined };
}

function formatMinutes(minutes) {
  const hour = Math.floor(minutes / 60);
  return `${String(hour).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function stopScore(header, stopName) {
  const headerTokens = new Set(normalize(header).split(' ').filter(Boolean));
  const stopTokens = new Set(normalize(stopName).split(' ').filter(Boolean));
  if (!headerTokens.size || !stopTokens.size) return 0;
  if ([...headerTokens].join(' ') === [...stopTokens].join(' ')) return 1;
  const shared = [...headerTokens].filter((token) => stopTokens.has(token)).length;
  return shared * 2 / (headerTokens.size + stopTokens.size);
}

function matchStop(header, stops) {
  const scored = stops.map((stop) => ({ stop, score: stopScore(header, stop.name) })).sort((a, b) => b.score - a.score);
  return scored[0]?.score >= 0.66 ? scored[0].stop : null;
}

function tableNotes(section) {
  return [...section.matchAll(/<[^>]+class="[^"]*table-note[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/gi)]
    .map((match) => cleanHtmlText(match[1]))
    .filter(Boolean);
}

function parseDirectionSection(section, direction, routeId) {
  const tables = [...section.matchAll(/<table\b[\s\S]*?<\/table>/gi)];
  const sectionNotes = tableNotes(section);
  const dayTypes = new Map();
  const patterns = [];
  const unmatchedHeaders = new Set();

  tables.forEach((tableMatch, tableIndex) => {
    const rows = parseRows(tableMatch[0]);
    if (rows.length < 3) return;
    const descriptor = parseDayDescriptor(rows[0].join(' '));
    dayTypes.set(descriptor.id, {
      id: descriptor.id,
      label: descriptor.label,
      ...(descriptor.weekdays ? { weekdays: descriptor.weekdays } : {}),
      publicHolidayPolicy: descriptor.publicHolidayPolicy,
    });
    const headerIndex = rows.findIndex((row, index) => index > 0 && row.some((cell) => cell && cell !== '-' && !timeCell(cell) && !/^(KALKIS|VARIS)$/i.test(normalize(cell))));
    if (headerIndex < 0) throw new Error(`Schedule headers not found for ${routeId}/${direction.id}/${tableIndex}`);
    const headers = rows[headerIndex];
    const matchedStops = headers.map((header) => {
      const stop = matchStop(header, direction.stops);
      if (!stop) unmatchedHeaders.add(header);
      return stop;
    });
    const journeys = [];
    rows.slice(headerIndex + 1).forEach((row, rowIndex) => {
      if (row.every((cell) => !timeCell(cell))) return;
      let previousMinutes = -1;
      let dayOffset = 0;
      const calls = [];
      headers.forEach((header, columnIndex) => {
        const parsed = timeCell(row[columnIndex] ?? '');
        const stop = matchedStops[columnIndex];
        if (!parsed || !stop) return;
        let minutes = parsed.minutes + dayOffset;
        while (minutes < previousMinutes) {
          dayOffset += 24 * 60;
          minutes = parsed.minutes + dayOffset;
        }
        previousMinutes = minutes;
        calls.push({ stopId: stop.id, stopName: header, time: formatMinutes(minutes), ...(parsed.marker ? { marker: parsed.marker } : {}) });
      });
      if (calls.length) journeys.push({ id: `${direction.id}-${descriptor.id}-${tableIndex + 1}-${rowIndex + 1}`, calls });
    });
    if (!journeys.length) throw new Error(`Schedule journeys not found for ${routeId}/${direction.id}/${descriptor.id}`);
    patterns.push({
      id: `${direction.id}-${descriptor.id}-${tableIndex + 1}`,
      dayTypeId: descriptor.id,
      notes: [...new Set([...descriptor.notes, ...sectionNotes])],
      journeys,
    });
  });

  return {
    dayTypes: [...dayTypes.values()],
    direction: { directionId: direction.id, name: direction.name, patterns },
    unmatchedHeaders: [...unmatchedHeaders],
  };
}

export function parseFerrySchedule(html, directions, routeId) {
  const goingStart = html.indexOf('table-responsive table-going');
  const returnStart = html.indexOf('table-responsive table-return');
  const tabTwoStart = html.indexOf('id="tab2"', returnStart);
  if (goingStart < 0 || returnStart < 0 || tabTwoStart < 0) throw new Error(`Schedule direction sections not found for ${routeId}`);
  const sections = {
    outbound: html.slice(goingStart, returnStart),
    return: html.slice(returnStart, tabTwoStart),
  };
  const parsed = directions.map((direction) => {
    const section = sections[direction.id];
    if (!section) throw new Error(`Unsupported ferry direction: ${direction.id}`);
    return parseDirectionSection(section, direction, routeId);
  });
  const dayTypes = new Map(parsed.flatMap((entry) => entry.dayTypes).map((dayType) => [dayType.id, dayType]));
  return {
    dayTypes: [...dayTypes.values()],
    directions: parsed.map((entry) => entry.direction),
    unmatchedHeaders: parsed.flatMap((entry) => entry.unmatchedHeaders.map((header) => ({ directionId: entry.direction.directionId, header }))),
  };
}
