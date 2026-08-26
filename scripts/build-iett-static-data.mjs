import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const source = join(root, 'data', 'iett-hat-guzergahlari.geojson');
const output = join(root, 'public', 'iett');
const dataset = JSON.parse(await readFile(source, 'utf8'));
const readGtfsFile = async (name) => {
  // The portal publishes GTFS payloads as .txt files. Keep supporting the
  // manually downloaded .csv files, but prefer .txt so an Excel-exported CSV
  // (which is silently capped at 1,048,576 rows) cannot hide most stops.
  for (const extension of ['txt', 'csv']) {
    const path = join(root, 'data', `${name}.${extension}`);
    try {
      await access(path);
      return readFile(path, 'utf8');
    } catch { /* try the next supported extension */ }
  }
  throw new Error(`Missing GTFS file: data/${name}.txt or data/${name}.csv`);
};
const parseCsv = (content) => {
  const [header, ...rows] = content.trim().split(/\r?\n/);
  const cleanHeader = header.replace(/^\uFEFF/, '');
  const delimiter = cleanHeader.includes(';') ? ';' : ',';
  const keys = cleanHeader.split(delimiter);
  return rows.map((row) => Object.fromEntries(keys.map((key, index) => [key, row.split(delimiter)[index] ?? ''])));
};
const gtfsRoutes = parseCsv(await readGtfsFile('routes'));
const gtfsTrips = parseCsv(await readGtfsFile('trips'));
const gtfsStops = parseCsv(await readGtfsFile('stops'));
const gtfsStopTimes = parseCsv(await readGtfsFile('stop_times'));
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
  const sequence = stopTimesByTrip.get(time.trip_id);
  if (sequence) sequence.push(time);
  else stopTimesByTrip.set(time.trip_id, [time]);
}
const gtfsTripIds = new Set(gtfsTrips.map((trip) => trip.trip_id));
const coveredTripCount = [...stopTimesByTrip.keys()].filter((tripId) => gtfsTripIds.has(tripId)).length;
if (coveredTripCount < gtfsTripIds.size * 0.9) {
  throw new Error(
    `GTFS stop_times is incomplete: only ${coveredTripCount} of ${gtfsTripIds.size} trips have stop records. `
    + 'Download the original stop_times.zip and extract stop_times.txt; do not export it through Excel.',
  );
}
const routeIdsByCode = new Map();
const routeIdByGeometryCode = new Map();
for (const route of gtfsRoutes) {
  const routeIds = routeIdsByCode.get(route.route_short_name);
  if (routeIds) routeIds.add(route.route_id);
  else routeIdsByCode.set(route.route_short_name, new Set([route.route_id]));
  if (route.route_code) routeIdByGeometryCode.set(route.route_code, route.route_id);
}
const tripIdsByRoute = new Map();
const tripDirectionById = new Map();
for (const trip of gtfsTrips) {
  tripDirectionById.set(trip.trip_id, trip.direction_id);
  const tripIds = tripIdsByRoute.get(trip.route_id);
  if (tripIds) tripIds.push(trip.trip_id);
  else tripIdsByRoute.set(trip.route_id, [trip.trip_id]);
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
const stopsForFeature = (feature) => {
  const exactRouteId = routeIdByGeometryCode.get(feature.properties.GUZERGAH_KODU);
  if (!exactRouteId) return [];
  const matchingTripIds = tripIdsByRoute.get(exactRouteId) ?? [];
  const selectedSequence = matchingTripIds
    .map((tripId) => stopTimesByTrip.get(tripId) ?? [])
    .sort((a, b) => b.length - a.length)[0] ?? [];
  return selectedSequence
    .sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence))
    .map((time) => stopById.get(time.stop_id))
    .filter(Boolean);
};
const chooseDirection = (features, direction, code) => {
  const candidates = features
    .filter((feature) => feature.properties.YON === direction)
    .map((feature) => ({ feature, stops: stopsForFeature(feature) }));
  const exactDefault = candidates.find(({ feature, stops }) => feature.properties.DEPAR_NO === '0' && stops.length);
  if (exactDefault) return exactDefault;
  const exactAlternative = candidates
    .filter(({ stops }) => stops.length)
    .sort((a, b) => b.stops.length - a.stops.length || b.feature.geometry.coordinates.length - a.feature.geometry.coordinates.length)[0];
  if (exactAlternative) return exactAlternative;

  // Some legacy GTFS rows omit route_code. Retain a last-resort directional
  // fallback so the line is still usable, while never mixing directions.
  const directionId = direction === 'GİDİŞ' ? '0' : '1';
  const matchingTripIds = [...(routeIdsByCode.get(code) ?? [])]
    .flatMap((routeId) => tripIdsByRoute.get(routeId) ?? [])
    .filter((tripId) => tripDirectionById.get(tripId) === directionId);
  const selectedSequence = matchingTripIds
    .map((tripId) => stopTimesByTrip.get(tripId) ?? [])
    .sort((a, b) => b.length - a.length)[0] ?? [];
  const stops = selectedSequence
    .sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence))
    .map((time) => stopById.get(time.stop_id))
    .filter(Boolean);
  const feature = candidates.find(({ feature }) => feature.properties.DEPAR_NO === '0')?.feature
    ?? candidates.sort((a, b) => b.feature.geometry.coordinates.length - a.feature.geometry.coordinates.length)[0]?.feature;
  return feature ? { feature, stops } : undefined;
};
const directionName = (feature) => feature.properties.GUZERGAH_ADI.trim().replace(/\s+-\s+/g, ' → ').replace(/\s+/g, ' ');
await mkdir(join(output, 'routes'), { recursive: true });
const index = [];
for (const [code, features] of groups) {
  const directions = [
    ['outbound', chooseDirection(features, 'GİDİŞ', code)],
    ['return', chooseDirection(features, 'DÖNÜŞ', code)],
  ].filter(([, result]) => result).map(([id, result]) => ({
    id,
    name: directionName(result.feature),
    durationMinutes: Math.round(Number(result.feature.properties.SURE?.replace(',', '.')) / 60) || 0,
    coordinates: result.feature.geometry.coordinates,
    stops: result.stops,
  }));
  const primaryDirection = directions[0];
  if (!primaryDirection) continue;
  const feature = features[0];
  const route = {
    id: `iett:${code}`, code, name: feature.properties.HAT_ADI.trim().replace(/\s+-\s+/g, ' — '),
    color: color(code), mode: mode(code), fareLabel: 'Resmî tarife bilgisi yakında eklenecek',
    durationMinutes: primaryDirection.durationMinutes,
    vehicleCount: 0, stopCount: primaryDirection.stops.length,
  };
  index.push(route);
  await writeFile(join(output, 'routes', `${encodeURIComponent(code)}.json`), JSON.stringify({
    data: {
      ...route,
      coordinates: primaryDirection.coordinates,
      stops: primaryDirection.stops,
      vehicles: [],
      directions,
    },
    meta: { source: 'ibb-open-data', status: 'static' },
  }));
}
index.sort((a, b) => a.code.localeCompare(b.code, 'tr'));
await writeFile(join(output, 'route-index.json'), JSON.stringify({ data: index, meta: { source: 'ibb-open-data', status: 'static', routeCount: index.length } }));
console.log(`Generated ${index.length} official IETT route records.`);
