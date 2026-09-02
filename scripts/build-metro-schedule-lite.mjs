import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractMetroRequestCode, findSourceDirection, parseMetroScheduleCatalog, summarizeFirstLastDepartures } from './metro-schedule-source.mjs';

const root = process.cwd();
const sourceUrl = 'https://www.metro.istanbul/SeferDurumlari/SeferDetaylari';
const requestedCodes = (process.argv.find((argument) => argument.startsWith('--codes='))?.slice(8).split(',').map((code) => code.trim().toUpperCase()).filter(Boolean) ?? ['M1A', 'M2', 'M4']);
const supportedCodes = new Set(['M1A', 'M2', 'M4']);
if (!requestedCodes.length || requestedCodes.some((code) => !supportedCodes.has(code))) throw new Error(`Bu lite snapshot yalnız ${[...supportedCodes].join(', ')} hatlarını destekler; --codes=M1A,M2,M4 kullanın.`);

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
  const routePayload = JSON.parse(await readFile(join(root, 'public', 'metro', 'routes', `${encodeURIComponent(code)}.json`), 'utf8'));
  const sourceLine = catalog.get(code);
  if (!sourceLine) throw new Error(`Metro İstanbul kaynak kataloğunda ${code} bulunamadı`);
  const directions = [];
  const publishableDirections = routePayload.data.directions.filter((direction) => direction.stops.length >= 2);
  if (!publishableDirections.length) throw new Error(`${code}: yayımlanabilir yön bulunamadı`);
  for (const direction of publishableDirections) {
    const sourceDirection = findSourceDirection(sourceLine, direction.name);
    const firstStop = direction.stops[0];
    if (!firstStop || !direction.stops.at(-1)) throw new Error(`${code}/${direction.id}: statik hat uç istasyonları bulunamadı`);
    const summary = await fetchSummary(sourceDirection);
    directions.push({ directionId: direction.id, name: direction.name, patterns: [{ id: `${direction.id}-source-day`, dayTypeId: 'source-day', notes: [`${requestedDate} için resmî kaynaktan alınan ilk/son hareket özetidir.`], journeys: [
      { id: `${direction.id}-first`, calls: [{ stopId: firstStop.id, stopName: firstStop.name, time: summary.first }] },
      { id: `${direction.id}-last`, calls: [{ stopId: firstStop.id, stopName: firstStop.name, time: summary.last }] },
    ] }] });
  }
  const routeId = routePayload.data.id;
  const filename = `metro-${code}.json`;
  const source = { provider: 'metro-istanbul', label: 'Metro İstanbul sefer tarifesi', url: sourceUrl, retrievedAt, validityUnknown: true };
  await writeFile(join(output, filename), JSON.stringify({ data: { schemaVersion: 1, routeId, timezone: 'Europe/Istanbul', source, dayTypes: [{ id: 'source-day', label: 'Kaynakta seçilen gün', publicHolidayPolicy: 'unknown' }], directions, summary: 'first-last' }, meta: { source: 'metro-istanbul-static-snapshot', status: 'static', fetchedAt: retrievedAt } }));
  manifest.data.routes[routeId] = { path: `/schedules/routes/${filename}`, ...source };
}

manifest.data.generatedAt = retrievedAt;
manifest.meta.routeCount = Object.keys(manifest.data.routes).length;
await writeFile(manifestPath, JSON.stringify(manifest));
console.log(`Metro İstanbul için ${requestedCodes.join(', ')} ilk/son sefer snapshot'ı üretildi.`);
