const namedEntities = {
  amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"', uuml: 'ü', Uuml: 'Ü',
};

export function decodeHtml(value) {
  return value
    .replace(/&#(x[\da-f]+|\d+);/gi, (_match, entity) => String.fromCodePoint(entity.toLowerCase().startsWith('x') ? Number.parseInt(entity.slice(1), 16) : Number.parseInt(entity, 10)))
    .replace(/&([a-z]+);/gi, (_match, entity) => namedEntities[entity] ?? `&${entity};`)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeStationName(value) {
  return decodeHtml(value)
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function optionValues(html, id) {
  const select = new RegExp(`<select[^>]+id=["']${id}["'][^>]*>([\\s\\S]*?)</select>`, 'i').exec(html)?.[1];
  if (!select) throw new Error(`Metro İstanbul kaynak sayfasında ${id} seçicisi bulunamadı`);
  return [...select.matchAll(/<option\s+value=["']([^"']*)["'][^>]*>([\s\S]*?)<\/option>/gi)]
    .map((match) => ({ id: decodeHtml(match[1]), label: decodeHtml(match[2]) }))
    .filter((option) => option.id && option.label);
}

export function parseMetroScheduleCatalog(html) {
  const token = /onclick=["']changeTheElements\((\d+)\);?["'][\s\S]*?<span[^>]*>\s*([^<]+?)\s*<\/span>/gi;
  const lines = new Map();
  for (const match of html.matchAll(token)) {
    const sourceLineId = match[1];
    const code = decodeHtml(match[2]);
    if (!/^(M\d+[A-Z]?|T\d+|F\d+)$/i.test(code)) continue;
    lines.set(code.toUpperCase(), {
      sourceLineId,
      routes: optionValues(html, `seferler_${sourceLineId}`).map((route) => {
        const [from, to, ...remainder] = route.label.split('-->>').map((part) => part.trim());
        if (!from || !to || remainder.length) throw new Error(`${code}: kaynak güzergâh etiketi çözümlenemedi: ${route.label}`);
        return { ...route, from, to };
      }),
      stations: optionValues(html, `istasyonlar_${sourceLineId}`),
    });
  }
  if (!lines.size) throw new Error('Metro İstanbul kaynak sayfasında hat kataloğu bulunamadı');
  return lines;
}

export function extractMetroRequestCode(html) {
  const code = /formData\.append\(["']kod["'],\s*["']([^"']+)["']\)/i.exec(html)?.[1];
  if (!code) throw new Error('Metro İstanbul kaynak sayfasında geçici istek kodu bulunamadı');
  return code;
}

export function findSourceDirection(catalogLine, directionName) {
  const [from, to, ...remainder] = directionName.split('→').map((part) => part.trim());
  if (!from || !to || remainder.length) throw new Error(`Uygulama yön adı çözümlenemedi: ${directionName}`);
  const route = catalogLine.routes.find((item) => normalizeStationName(item.from) === normalizeStationName(from) && normalizeStationName(item.to) === normalizeStationName(to));
  if (!route) throw new Error(`Kaynakta ${directionName} yönü bulunamadı`);
  const station = catalogLine.stations.find((item) => normalizeStationName(item.label) === normalizeStationName(from));
  if (!station) throw new Error(`Kaynakta ${from} başlangıç istasyonu bulunamadı`);
  return { routeId: route.id, stationId: station.id, sourceFrom: route.from, sourceTo: route.to };
}

export function summarizeFirstLastDepartures(value) {
  if (!value || value.durum !== '0' || !Array.isArray(value.sefer) || !value.sefer.length) throw new Error('Metro İstanbul kaynak yanıtında sefer bulunamadı');
  const departures = value.sefer.map((item) => {
    if (typeof item?.zaman !== 'string' || !/^\d{2}:\d{2}$/.test(item.zaman)) throw new Error('Metro İstanbul kaynak yanıtında geçersiz saat bulundu');
    return item.zaman;
  });
  const first = departures[0];
  let last = departures.at(-1);
  if (last < first) last = `24:${last.slice(3)}`;
  return { first, last };
}
