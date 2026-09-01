const entityMap = { amp: '&', apos: "'", quot: '"', nbsp: ' ', Ccedil: 'Ç', ccedil: 'ç', Gbreve: 'Ğ', gbreve: 'ğ', Idot: 'İ', inodot: 'ı', Ouml: 'Ö', ouml: 'ö', Scedil: 'Ş', scedil: 'ş', Uuml: 'Ü', uuml: 'ü' };

export function cleanHtmlText(value) {
  return value.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (match, entity) => entityMap[entity] ?? match)
    .replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  return cleanHtmlText(value).toLocaleUpperCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/İ/g, 'I').replace(/[^A-Z0-9]+/g, ' ').trim();
}

function dayType(value) {
  const normalized = normalize(value);
  if (normalized.includes('IS GUN')) return { id: 'weekday', label: 'İş günleri', weekdays: [1, 2, 3, 4, 5], publicHolidayPolicy: 'excluded' };
  if (normalized.includes('CUMARTESI')) return { id: 'saturday', label: 'Cumartesi', weekdays: [6], publicHolidayPolicy: 'excluded' };
  if (normalized.includes('PAZAR') && normalized.includes('TATIL')) return { id: 'sunday-holiday', label: 'Pazar ve tatil günleri', weekdays: [7], publicHolidayPolicy: 'included' };
  if (normalized.includes('PAZAR')) return { id: 'sunday', label: 'Pazar', weekdays: [7], publicHolidayPolicy: 'unknown' };
  throw new Error(`Bilinmeyen İETT gün türü: ${value}`);
}

function cells(row) {
  return [...row.matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => ({ html: match[2], text: cleanHtmlText(match[2]) }));
}

function time(value) {
  const match = /^(\d{1,2})[:.](\d{2})(?:\s*([*A-Za-zÇĞİÖŞÜçğıöşü0-9-]+))?$/.exec(value.trim());
  if (!match || Number(match[2]) > 59) return null;
  return { value: `${match[1].padStart(2, '0')}:${match[2]}`, marker: match[3] };
}

/** Parses the official GetScheduledDepartureTimes HTML fragment without DOM dependencies. */
export function parseIettScheduleTables(html, routeId, directions) {
  const tables = [...html.matchAll(/<table\b[^>]*class="[^"]*\bline-table\b[^"]*"[^>]*>([\s\S]*?)<\/table>/gi)];
  if (!tables.length) throw new Error(`İETT planlı kalkış tablosu bulunamadı: ${routeId}`);
  const dayTypes = new Map();
  const parsedDirections = [];
  const usedDirectionIds = new Set();

  for (const [tableIndex, table] of tables.entries()) {
    const rows = [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => cells(match[1])).filter((row) => row.length);
    if (rows.length < 3) throw new Error(`İETT planlı kalkış tablosu eksik: ${routeId}/${tableIndex + 1}`);
    const departureStopName = rows[0][0]?.text.replace(/\s+KALKIŞ$/iu, '').trim();
    if (!departureStopName) throw new Error(`İETT kalkış durağı bulunamadı: ${routeId}/${tableIndex + 1}`);
    const candidates = directions.filter((direction) => !usedDirectionIds.has(direction.id)).map((direction) => ({
      direction,
      score: Math.max(...direction.stops.map((stop, index) => ({ index, normalized: normalize(stop.name) }))
        .filter(({ normalized }) => normalized === normalize(departureStopName))
        .map(({ index }) => index === 0 ? 2 : index === direction.stops.length - 1 ? 1 : 0), 0),
    })).sort((left, right) => right.score - left.score);
    const selected = candidates[0];
    if (!selected || selected.score === 0) throw new Error(`İETT kalkış durağı statik güzergâhla eşleşmedi: ${routeId}/${departureStopName}`);
    usedDirectionIds.add(selected.direction.id);
    const stop = selected.direction.stops[selected.score === 2 ? 0 : selected.direction.stops.length - 1];
    const headers = rows[1].map((cell) => dayType(cell.text));
    if (!headers.length) throw new Error(`İETT gün türleri bulunamadı: ${routeId}/${departureStopName}`);
    headers.forEach((item) => dayTypes.set(item.id, item));
    const patterns = headers.map((header) => ({ id: `${selected.direction.id}-${header.id}`, dayTypeId: header.id, notes: ['Kırmızı işaretli saatler resmî sayfada ÖHO seferi olarak belirtilir.'], journeys: [] }));
    rows.slice(2).forEach((row, rowIndex) => row.forEach((cell, columnIndex) => {
      const parsed = time(cell.text);
      if (!parsed) {
        if (cell.text) throw new Error(`İETT saat biçimi desteklenmiyor: ${routeId}/${departureStopName}/${cell.text}`);
        return;
      }
      const pattern = patterns[columnIndex];
      if (!pattern) throw new Error(`İETT tablo sütunu gün türüyle eşleşmedi: ${routeId}/${departureStopName}`);
      const isOho = /color\s*:\s*red/i.test(cell.html);
      pattern.journeys.push({ id: `${pattern.id}-${rowIndex + 1}`, calls: [{ stopId: stop.id, stopName: stop.name, time: parsed.value, ...(isOho ? { marker: 'ÖHO' } : {}), ...(parsed.marker ? { marker: parsed.marker } : {}) }] });
    }));
    if (patterns.some((pattern) => !pattern.journeys.length)) throw new Error(`İETT gün türü boş: ${routeId}/${departureStopName}`);
    parsedDirections.push({ directionId: selected.direction.id, name: selected.direction.name, patterns });
  }
  return { dayTypes: [...dayTypes.values()], directions: parsedDirections };
}
