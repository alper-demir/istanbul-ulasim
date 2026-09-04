import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractMetroRequestCode, findExplicitSourceDirection, findSourceDirection, parseMetroScheduleCatalog, summarizeFirstLastDepartures } from './metro-schedule-source.mjs';
import { m7SegmentForDirection } from './m7-segment-mappings.mjs';

const root = process.cwd();
const sourceUrl = 'https://www.metro.istanbul/SeferDurumlari/SeferDetaylari';
// M7 source directions are published as operating segments. They are written
// with an explicit segment scope instead of being presented as a full-route
// schedule when the official endpoints do not match the static geometry.
const supportedCodes = ['M1A', 'M1B', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'T1', 'T3', 'T4', 'T5', 'F1', 'F4'];
const requestedCodes = process.argv.find((argument) => argument.startsWith('--codes='))?.slice(8).split(',').map((code) => code.trim().toUpperCase()).filter(Boolean) ?? supportedCodes;
if (!requestedCodes.length || requestedCodes.some((code) => !supportedCodes.includes(code))) throw new Error(`Bu snapshot yalnız ${supportedCodes.join(', ')} hatlarını destekler.`);

const headers = { 'user-agent': 'istanbulum-schedule-maintenance/0.7', accept: 'text/html,application/xhtml+xml', 'accept-language': 'tr-TR,tr;q=0.9' };
const pageResponse = await fetch(sourceUrl, { headers, signal: AbortSignal.timeout(25_000) });
if (!pageResponse.ok) throw new Error(`Metro İstanbul tarife sayfası ${pageResponse.status} döndürdü`);
const pageHtml = await pageResponse.text();
const cookie = pageResponse.headers.getSetCookie().map((value) => value.split(';', 1)[0]).join('; ');
if (!cookie) throw new Error('Metro İstanbul tarife sayfası bakım oturumu çerezi vermedi');
const catalog = parseMetroScheduleCatalog(pageHtml);
const requestCode = extractMetroRequestCode(pageHtml);
const retrievedAt = new Date().toISOString();
const requestedDate = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());

const manifestPath = join(root, 'public', 'schedules', 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const output = join(root, 'public', 'schedules', 'routes');
await mkdir(output, { recursive: true });

async function fetchSummary(direction) {
  const form = new URLSearchParams({ secim: '3', saat: '', dakika: '', tarih1: '', tarih2: requestedDate, station: direction.stationId, route: direction.routeId, kod: requestCode });
  const response = await fetch('https://www.metro.istanbul/SeferDurumlari/AJAXSeferGetir', {
    method: 'POST', headers: { ...headers, accept: 'application/json, text/javascript, */*; q=0.01', cookie, origin: 'https://www.metro.istanbul', referer: sourceUrl, 'x-requested-with': 'XMLHttpRequest', 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body: form, signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`Metro İstanbul sefer özeti ${response.status} döndürdü`);
  return summarizeFirstLastDepartures(await response.json());
}

for (const code of requestedCodes) {
  const network = code.startsWith('M') ? 'metro' : 'rail';
  const routePayload = JSON.parse(await readFile(join(root, 'public', network, 'routes', `${encodeURIComponent(code)}.json`), 'utf8'));
  const sourceLine = catalog.get(code);
  if (!sourceLine) throw new Error(`Metro İstanbul kaynak kataloğunda ${code} bulunamadı`);
  const directions = [];
  const publishableDirections = routePayload.data.directions.filter((direction) => direction.stops.length >= 2);
  if (!publishableDirections.length) throw new Error(`${code}: yayımlanabilir yön bulunamadı`);
  for (const direction of publishableDirections) {
    const m7Segments = code === 'M7' ? m7SegmentForDirection(direction) : null;
    const segments = m7Segments ?? [{ sourceDirection: findSourceDirection(sourceLine, direction.name), staticFrom: direction.stops[0]?.name }];
    if (!direction.stops[0] || !direction.stops.at(-1)) throw new Error(`${code}/${direction.id}: statik hat uç istasyonları bulunamadı`);
    for (const [segmentIndex, segment] of segments.entries()) {
      const sourceDirection = segment.sourceDirection ?? findExplicitSourceDirection(sourceLine, segment);
      const firstStop = direction.stops.find((stop) => stop.name === (segment.staticFrom ?? direction.stops[0].name));
      if (!firstStop) throw new Error(`${code}/${direction.id}: ${segment.staticFrom} statik istasyonu bulunamadı`);
      const summary = await fetchSummary(sourceDirection);
      const directionId = m7Segments ? `${direction.id}-segment-${segmentIndex + 1}` : direction.id;
      directions.push({ directionId, name: m7Segments ? `${segment.sourceFrom} → ${segment.sourceTo}` : direction.name, ...(m7Segments ? { scope: 'segment', stopIds: segment.stopIds } : {}), patterns: [{ id: `${directionId}-source-day`, dayTypeId: 'source-day', notes: [`${requestedDate} için resmî kaynaktan alınan ilk/son hareket özetidir.`, ...(m7Segments ? ['M7 işletme bölümü; tam hat seferi olarak yorumlanmamalıdır.'] : [])], journeys: [
        { id: `${directionId}-first`, calls: [{ stopId: firstStop.id, stopName: firstStop.name, time: summary.first }] },
        { id: `${directionId}-last`, calls: [{ stopId: firstStop.id, stopName: firstStop.name, time: summary.last }] },
      ] }] });
    }
  }
  const routeId = routePayload.data.id;
  const filename = `${network}-${code}.json`;
  const source = { provider: 'metro-istanbul', label: 'Metro İstanbul sefer tarifesi', url: sourceUrl, retrievedAt, validityUnknown: true };
  await writeFile(join(output, filename), JSON.stringify({ data: { schemaVersion: 1, routeId, timezone: 'Europe/Istanbul', source, dayTypes: [{ id: 'source-day', label: 'Kaynakta seçilen gün', publicHolidayPolicy: 'unknown' }], directions, summary: 'first-last' }, meta: { source: 'metro-istanbul-static-snapshot', status: 'static', fetchedAt: retrievedAt } }));
  manifest.data.routes[routeId] = { path: `/schedules/routes/${filename}`, ...source };
}

manifest.data.generatedAt = retrievedAt;
manifest.meta.routeCount = Object.keys(manifest.data.routes).length;
await writeFile(manifestPath, JSON.stringify(manifest));
console.log(`Metro İstanbul için ${requestedCodes.join(', ')} ilk/son sefer snapshot'ı üretildi.`);
