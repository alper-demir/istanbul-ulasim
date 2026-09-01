import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseIettScheduleTables } from './iett-schedule-parser.mjs';

const root = process.cwd();
const routeIndex = JSON.parse(await readFile(join(root, 'public', 'iett', 'route-index.json'), 'utf8')).data;
const scheduleRoot = join(root, 'public', 'schedules');
const output = join(scheduleRoot, 'routes');
const args = new Map(process.argv.slice(2).map((argument) => argument.replace(/^--/, '').split('=')));
const requestedCodes = args.get('codes')?.split(',').map((code) => code.trim().toLocaleUpperCase('tr-TR')).filter(Boolean);
const routeLimit = args.has('limit') ? Number(args.get('limit')) : undefined;
const requestDelayMs = Math.max(500, Number(args.get('delay-ms') ?? 1_000));
if (!requestedCodes?.length && !Number.isInteger(routeLimit) && !args.has('all')) {
  throw new Error('İETT kaynağını korumak için --codes=500T, --limit=1 veya açıkça --all belirtin');
}
const routes = routeIndex.filter((route) => !requestedCodes || requestedCodes.includes(route.code)).slice(0, routeLimit);
const retrievedAt = new Date().toISOString();
const sourceBase = 'https://iett.istanbul/RouteDetail?hkod=';

if (!routes.length) throw new Error('İETT sefer üretimi için hat bulunamadı');
await mkdir(output, { recursive: true });
const existingManifest = JSON.parse(await readFile(join(scheduleRoot, 'manifest.json'), 'utf8'));
const manifestRoutes = { ...existingManifest.data.routes };
const report = { retrievedAt, requested: routes.length, published: [], unavailable: [], failed: [] };

function inputValue(html, id) {
  const match = html.match(new RegExp(`<input[^>]+id="${id}"[^>]*value="([^"]*)"|<input[^>]+value="([^"]*)"[^>]*id="${id}"`, 'i'));
  return (match?.[1] ?? match?.[2] ?? '').trim();
}

async function fetchWithRetry(url, options, label) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
      if (response.ok) return response;
      lastError = new Error(`${label} ${response.status} döndürdü`);
      if (response.status < 500) throw lastError;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, requestDelayMs * attempt));
  }
  throw lastError;
}

for (const [index, route] of routes.entries()) {
  const sourceUrl = `${sourceBase}${encodeURIComponent(route.code)}`;
  try {
    const page = await fetchWithRetry(sourceUrl, {}, 'Hat sayfası');
    const pageHtml = await page.text();
    const body = new URLSearchParams({
      rstart: inputValue(pageHtml, 'SHATBASI'), rend: inputValue(pageHtml, 'SHATSONU'),
      timeschule: inputValue(pageHtml, 'GetPlanlananSeferSaati'), freq: inputValue(pageHtml, 'GetMetobusFrekans'),
      lngid: inputValue(pageHtml, 'languageid') || '1', hCode: route.code,
    });
    const response = await fetchWithRetry('https://iett.istanbul/tr/RouteStation/GetScheduledDepartureTimes', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body,
    }, 'Kalkış tablosu');
    const routePayload = JSON.parse(await readFile(join(root, 'public', 'iett', 'routes', `${encodeURIComponent(route.code)}.json`), 'utf8'));
    const parsed = parseIettScheduleTables(await response.text(), routePayload.data.id, routePayload.data.directions);
    const source = { provider: 'iett', label: 'İETT hareket saatleri', url: sourceUrl, retrievedAt, validityUnknown: true };
    const filename = `iett-${encodeURIComponent(route.code)}.json`;
    await writeFile(join(output, filename), JSON.stringify({ data: { schemaVersion: 1, routeId: routePayload.data.id, timezone: 'Europe/Istanbul', source, dayTypes: parsed.dayTypes, directions: parsed.directions }, meta: { source: 'iett-static-snapshot', status: 'static', fetchedAt: retrievedAt } }));
    manifestRoutes[routePayload.data.id] = { path: `/schedules/routes/${filename}`, ...source };
    report.published.push(route.code);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/tablosu bulunamadı|gün türü boş/i.test(message)) report.unavailable.push({ code: route.code, reason: message });
    else report.failed.push({ code: route.code, reason: message });
  }
  if ((index + 1) % 25 === 0 || index + 1 === routes.length) console.log(`İETT seferleri: ${index + 1}/${routes.length}`);
  await new Promise((resolve) => setTimeout(resolve, requestDelayMs));
}

await writeFile(join(scheduleRoot, 'manifest.json'), JSON.stringify({ data: { ...existingManifest.data, generatedAt: retrievedAt, routes: manifestRoutes }, meta: { ...existingManifest.meta, routeCount: Object.keys(manifestRoutes).length } }));
await mkdir(join(root, 'data', 'schedules', 'reports'), { recursive: true });
await writeFile(join(root, 'data', 'schedules', 'reports', `iett-${retrievedAt.slice(0, 10)}.json`), JSON.stringify(report, null, 2));
console.log(`İETT seferleri tamamlandı: ${report.published.length} yayımlandı, ${report.unavailable.length} tablo yok, ${report.failed.length} hata.`);
if (report.failed.length) process.exitCode = 1;
