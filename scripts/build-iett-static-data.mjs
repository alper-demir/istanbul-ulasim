import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const source = join(root, 'data', 'iett-hat-guzergahlari.geojson');
const output = join(root, 'public', 'iett');
const dataset = JSON.parse(await readFile(source, 'utf8'));
const parseCsv = (content) => {
  const [header, ...rows] = content.trim().split(/\r?\n/);
  const keys = header.replace(/^\uFEFF/, '').split(';');
  return rows.map((row) => Object.fromEntries(keys.map((key, index) => [key, row.split(';')[index] ?? ''])));
};
const gtfsRoutes = parseCsv(await readFile(join(root, 'data', 'routes.csv'), 'utf8'));
const gtfsTrips = parseCsv(await readFile(join(root, 'data', 'trips.csv'), 'utf8'));
const gtfsStops = parseCsv(await readFile(join(root, 'data', 'stops.csv'), 'utf8'));
const gtfsStopTimes = parseCsv(await readFile(join(root, 'data', 'stop_times.csv'), 'utf8'));
const normalizeCoordinate = (value) => {
  const direct = Number(value.replace(',', '.'));
  if (Number.isFinite(direct) && Math.abs(direct) > 1 && Math.abs(direct) < 180) return direct;
  return Number(value.replace(/[^0-9-]/g, '')) / 1e13;
};
const stopById = new Map(gtfsStops.map((stop) => [stop.stop_id, {
  id: `iett-stop:${stop.stop_id}`,
  name: stop.stop_name,
  district: stop.stop_desc.replace(/^direction:\s*/i, '') || 'İstanbul',
  coordinates: [normalizeCoordinate(stop.stop_lon), normalizeCoordinate(stop.stop_lat)],
}]).filter(([, stop]) => stop.coordinates[0] > 26 && stop.coordinates[0] < 31 && stop.coordinates[1] > 40 && stop.coordinates[1] < 42));
const stopTimesByTrip = new Map();
for (const time of gtfsStopTimes) {
  stopTimesByTrip.set(time.trip_id, [...(stopTimesByTrip.get(time.trip_id) ?? []), time]);
}
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
  const matchingRouteIds = new Set(gtfsRoutes.filter((item) => item.route_short_name === code).map((item) => item.route_id));
  const matchingTripIds = new Set(gtfsTrips.filter((item) => matchingRouteIds.has(item.route_id)).map((item) => item.trip_id));
  const selectedSequence = [...matchingTripIds].map((tripId) => stopTimesByTrip.get(tripId) ?? []).sort((a, b) => b.length - a.length)[0] ?? [];
  const stops = selectedSequence
    .sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence))
    .map((time) => stopById.get(time.stop_id))
    .filter(Boolean);
  route.stopCount = stops.length;
  index[index.length - 1].stopCount = stops.length;
  await writeFile(join(output, 'routes', `${encodeURIComponent(code)}.json`), JSON.stringify({ data: { ...route, coordinates: feature.geometry.coordinates, stops, vehicles: [] }, meta: { source: 'ibb-open-data', status: 'static' } }));
}
index.sort((a, b) => a.code.localeCompare(b.code, 'tr'));
await writeFile(join(output, 'route-index.json'), JSON.stringify({ data: index, meta: { source: 'ibb-open-data', status: 'static', routeCount: index.length } }));
console.log(`Generated ${index.length} official IETT route records.`);
