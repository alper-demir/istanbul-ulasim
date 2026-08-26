import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const source = join(root, 'data', 'iett-hat-guzergahlari.geojson');
const output = join(root, 'public', 'iett');
const dataset = JSON.parse(await readFile(source, 'utf8'));
const groups = new Map();
for (const feature of dataset.features) {
  const code = feature.properties.HAT_KODU?.trim();
  if (!code || feature.properties.DURUM !== '1' || feature.geometry?.type !== 'LineString') continue;
  groups.set(code, [...(groups.get(code) ?? []), feature]);
}
const mode = (code) => /^34(?:A|AS|AV|BZ|C|G|Z)?$/i.test(code) ? 'Metrobüs' : 'Otobüs';
const color = (code) => {
  if (mode(code) === 'Metrobüs') return '#f3a712';
  const palette = ['#087f8c', '#ef5b4c', '#277da1', '#7c3aed', '#db2777', '#16a34a'];
  return palette[[...code].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length];
};
const choose = (features) => features.find((f) => f.properties.DEPAR_NO === '0' && f.properties.YON === 'GİDİŞ')
  ?? features.find((f) => f.properties.DEPAR_NO === '0')
  ?? features.reduce((longest, f) => f.geometry.coordinates.length > longest.geometry.coordinates.length ? f : longest);
await mkdir(join(output, 'routes'), { recursive: true });
const index = [];
for (const [code, features] of groups) {
  const feature = choose(features);
  const route = {
    id: `iett:${code}`, code, name: feature.properties.HAT_ADI.trim().replace(/\s+-\s+/g, ' — '),
    color: color(code), mode: mode(code), fareLabel: 'Resmî tarife bilgisi yakında eklenecek',
    durationMinutes: Math.round(Number(feature.properties.SURE?.replace(',', '.')) / 60) || 0,
    vehicleCount: 0, stopCount: 0,
  };
  index.push(route);
  await writeFile(join(output, 'routes', `${encodeURIComponent(code)}.json`), JSON.stringify({ data: { ...route, coordinates: feature.geometry.coordinates, stops: [], vehicles: [] }, meta: { source: 'ibb-open-data', status: 'static' } }));
}
index.sort((a, b) => a.code.localeCompare(b.code, 'tr'));
await writeFile(join(output, 'route-index.json'), JSON.stringify({ data: index, meta: { source: 'ibb-open-data', status: 'static', routeCount: index.length } }));
console.log(`Generated ${index.length} official IETT route records.`);
