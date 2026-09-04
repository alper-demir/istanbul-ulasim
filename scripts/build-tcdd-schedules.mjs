import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractApiDepartureTimes } from './tcdd-schedule-source.mjs';
import { tcddEndpointMapping } from './tcdd-station-mappings.mjs';

const root = process.cwd();
const requested = process.argv.find((arg) => arg.startsWith('--codes='))?.slice(8).split(',').map((code) => code.trim().toUpperCase()).filter(Boolean) ?? ['B1', 'M11'];
const routeConfig = {
  B1: { network: 'rail', sourceUrl: 'https://www.tcddtasimacilik.gov.tr/marmaray/tr/neredennereye', sourceLabel: 'TCDD Taşımacılık Marmaray', provider: 'tcdd-tasimacilik' },
  M11: { network: 'metro', sourceUrl: 'https://www.tcddtasimacilik.gov.tr/marmaray/tr/gayrettepe', sourceLabel: 'TCDD Taşımacılık Gayrettepe–Halkalı', provider: 'tcdd-tasimacilik' },
};
const headers = { 'user-agent': 'istanbulum-schedule-maintenance/0.8', accept: 'text/html,application/xhtml+xml', 'accept-language': 'tr-TR,tr;q=0.9' };
const apiUrl = 'https://api.tcddtasimacilik.gov.tr/api/SubPages/GetTransportationTrainsGroupwithHours?marmaray=true';
const apiToken = process.env.TCDD_API_BASIC_TOKEN;
if (!apiToken) throw new Error('TCDD_API_BASIC_TOKEN tanımlı değil; resmî API bakım kimlik bilgisi olmadan çalıştırılmadı');

async function readRoute(code) {
  const config = routeConfig[code];
  if (!config) throw new Error(`TCDD desteği olmayan hat: ${code}`);
  return { config, payload: JSON.parse(await readFile(join(root, 'public', config.network, 'routes', `${code}.json`), 'utf8')) };
}

async function main() {
  const manifestPath = join(root, 'public', 'schedules', 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const sourceData = new Map();
  for (const code of requested) {
    const { config } = await readRoute(code);
    if (!sourceData.has(config.sourceUrl)) {
      const response = await fetch(apiUrl, { headers: { ...headers, accept: 'application/json', authorization: `Basic ${apiToken}` }, signal: AbortSignal.timeout(25_000) });
      if (!response.ok) throw new Error(`TCDD resmî sefer API'si ${response.status} döndürdü`);
      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error('TCDD resmî sefer API boş yanıt döndürdü');
      sourceData.set(config.sourceUrl, { data, retrievedAt: new Date().toISOString() });
    }
    const { payload } = await readRoute(code);
    const source = sourceData.get(config.sourceUrl);
    const directions = payload.data.directions.map((direction) => {
      const endpointMapping = tcddEndpointMapping(code, direction);
      const times = extractApiDepartureTimes(source.data, endpointMapping);
      const departureStop = direction.stops[0];
      if (!departureStop) throw new Error(`${code}/${direction.id}: başlangıç istasyonu bulunamadı`);
      return {
        directionId: direction.id,
        name: direction.name,
        scope: 'full-route',
        stopIds: endpointMapping.stopIds,
        patterns: [{
          id: `${direction.id}-tcdd-source`,
          dayTypeId: 'source-day',
          notes: ['TCDD kaynağından alınan muhtemel hareket saatleridir; zaman taahhüdü değildir.', 'Ara istasyon saatleri tahmin edilmez; yalnız doğrulanmış kalkış özeti gösterilir.'],
          journeys: [
            { id: `${direction.id}-first`, calls: [{ stopId: departureStop.id, stopName: departureStop.name, time: times[0] }] },
            { id: `${direction.id}-last`, calls: [{ stopId: departureStop.id, stopName: departureStop.name, time: times.at(-1) }] },
          ],
        }],
      };
    });
    const output = { data: { schemaVersion: 1, routeId: payload.data.id, timezone: 'Europe/Istanbul', source: { provider: config.provider, label: config.sourceLabel, url: config.sourceUrl, retrievedAt: source.retrievedAt, validityUnknown: true }, dayTypes: [{ id: 'source-day', label: 'Kaynakta seçilen gün', publicHolidayPolicy: 'unknown' }], directions, summary: 'first-last' }, meta: { source: config.provider, status: 'static', fetchedAt: source.retrievedAt } };
    const file = `${config.network}-${code}.json`;
    await writeFile(join(root, 'public', 'schedules', 'routes', file), JSON.stringify(output));
    manifest.data.routes[payload.data.id] = { path: `/schedules/routes/${file}`, provider: config.provider, label: config.sourceLabel, url: config.sourceUrl, retrievedAt: source.retrievedAt, validityUnknown: true };
    console.log(`${code}: ${file} üretildi`);
  }
  manifest.data.generatedAt = new Date().toISOString();
  manifest.meta.routeCount = Object.keys(manifest.data.routes).length;
  await writeFile(manifestPath, JSON.stringify(manifest));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
