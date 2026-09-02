import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fareForRoute } from './fare-catalog.mjs';

const root = process.cwd();
const manifest = JSON.parse(await readFile(join(root, 'data', 'metro', 'lines.json'), 'utf8'));
const requestedCodes = (process.argv.find((argument) => argument.startsWith('--codes='))?.slice(8).split(',').map((code) => code.trim().toUpperCase()).filter(Boolean) ?? null);
const lines = requestedCodes
  ? manifest.lines.filter((line) => requestedCodes.includes(line.code))
  : manifest.lines;
if (!lines.length || requestedCodes?.some((code) => !lines.some((line) => line.code === code))) throw new Error('İstenen metro hattı veri kataloğunda bulunamadı');
const output = join(root, 'public', 'metro');
const endpoint = 'https://overpass-api.de/api/interpreter';
const unique = (values) => [...new Set(values)];

async function requestRelations(ids) {
  const query = `[out:json][timeout:120];relation(id:${ids.join(',')});out geom;>;out geom qt;`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'user-agent': 'istanbulum-static-data-builder/0.6.0' },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(150_000),
  });
  if (!response.ok) throw new Error(`OpenStreetMap snapshot failed (${response.status})`);
  const payload = await response.json();
  return payload.elements;
}

const allRelationIds = unique(lines.flatMap((line) => line.directions.flatMap((direction) => direction.relationIds)));
const elements = await requestRelations(allRelationIds);
const relationById = new Map(elements.filter((item) => item.type === 'relation').map((item) => [item.id, item]));
const nodeById = new Map(elements.filter((item) => item.type === 'node').map((item) => [item.id, item]));
const wayById = new Map(elements.filter((item) => item.type === 'way').map((item) => [item.id, item]));

function stationFromMember(member) {
  if (member.type !== 'node' || !['stop', 'platform'].includes(member.role)) return null;
  const node = nodeById.get(member.ref);
  const name = node?.tags?.name?.trim() ?? manifest.stationNameOverrides?.[member.ref];
  if (!node || !name || !Number.isFinite(node.lat) || !Number.isFinite(node.lon)) return null;
  return { id: `metro-stop:osm:${member.ref}`, name, district: node.tags?.['addr:district'] ?? 'İstanbul', coordinates: [node.lon, node.lat] };
}

function stationsForRelations(ids) {
  const stations = [];
  for (const id of ids) {
    const relation = relationById.get(id);
    if (!relation) throw new Error(`OSM relation ${id} is missing from the snapshot`);
    for (const member of relation.members ?? []) {
      const station = stationFromMember(member);
      if (!station) continue;
      const previous = stations.at(-1);
      if (previous?.id !== station.id) stations.push(station);
    }
  }
  return stations;
}

function geometryForRelations(ids, fallback) {
  const coordinates = [];
  for (const id of ids) {
    const relation = relationById.get(id);
    for (const member of relation?.members ?? []) {
      if (member.type !== 'way') continue;
      const way = wayById.get(member.ref);
      const segment = (way?.geometry ?? [])
        .filter((point) => Number.isFinite(point.lon) && Number.isFinite(point.lat))
        .map((point) => [point.lon, point.lat]);
      if (segment.length < 2) continue;
      const previous = coordinates.at(-1);
      const distance = (a, b) => ((a[0] - b[0]) ** 2) + ((a[1] - b[1]) ** 2);
      if (previous && distance(previous, segment.at(-1)) < distance(previous, segment[0])) segment.reverse();
      coordinates.push(...(coordinates.length && coordinates.at(-1)[0] === segment[0][0] && coordinates.at(-1)[1] === segment[0][1] ? segment.slice(1) : segment));
    }
  }
  return coordinates.length >= 2 ? coordinates : fallback;
}

function validateLine(line, directions) {
  const primary = directions.find((direction) => direction.id === 'outbound') ?? directions[0];
  const actualCount = primary?.stops.length ?? 0;
  // OSM relations can briefly lag a newly opened extension. Reject a clearly
  // incomplete relation, but leave a visible warning for a small discrepancy
  // that must be reconciled against the linked official line page.
  if (!primary || actualCount < Math.ceil(line.minimumStopCount * 0.8)) {
    throw new Error(`${line.code}: expected about ${line.minimumStopCount} stations, received ${actualCount}`);
  }
  if (actualCount < line.minimumStopCount) {
    console.warn(`${line.code}: OSM has ${actualCount}/${line.minimumStopCount} expected primary stations; verify the next snapshot against ${line.officialUrl}`);
  }
  for (const direction of directions) {
    for (const stop of direction.stops) {
      const [longitude, latitude] = stop.coordinates;
      if (longitude < 26 || longitude > 31 || latitude < 40 || latitude > 42) throw new Error(`${line.code}: invalid station coordinate for ${stop.name}`);
    }
  }
}

await mkdir(join(output, 'routes'), { recursive: true });
const routeIndex = [];
const stopIndex = new Map();
for (const line of lines) {
  const directions = line.directions.map((direction) => {
    const stops = [...(direction.prependStops ?? []), ...stationsForRelations(direction.relationIds), ...(direction.appendStops ?? [])];
    return { ...direction, durationMinutes: 0, coordinates: geometryForRelations(direction.relationIds, stops.map((stop) => stop.coordinates)), stops };
  });
  validateLine(line, directions);
  const primary = directions.find((direction) => direction.id === 'outbound') ?? directions[0];
  const route = {
    id: `metro:${line.code}`, code: line.code, name: line.name, color: line.color, mode: 'Metro',
    operator: line.operator, source: 'metro-istanbul', supportsLiveVehicles: false,
    ...fareForRoute(`metro:${line.code}`), durationMinutes: primary.durationMinutes,
    coordinates: primary.coordinates, stops: primary.stops, vehicles: [], directions,
  };
  routeIndex.push({ ...route, coordinates: undefined, stops: undefined, vehicles: undefined, directions: undefined, vehicleCount: 0, stopCount: primary.stops.length });
  for (const direction of directions) direction.stops.forEach((stop, index) => {
    const entry = stopIndex.get(stop.id) ?? { ...stop, routes: [] };
    if (!entry.routes.some(([routeId, directionId]) => routeId === route.id && directionId === direction.id)) entry.routes.push([route.id, direction.id, index + 1]);
    stopIndex.set(stop.id, entry);
  });
  await writeFile(join(output, 'routes', `${line.code}.json`), JSON.stringify({
    data: route,
    meta: { source: 'metro-istanbul + openstreetmap', status: 'static', fetchedAt: new Date().toISOString(), officialUrl: line.officialUrl },
  }));
}
if (!requestedCodes) {
  routeIndex.sort((a, b) => a.code.localeCompare(b.code, 'tr'));
  await writeFile(join(output, 'route-index.json'), JSON.stringify({ data: routeIndex, meta: { source: 'metro-istanbul + openstreetmap', status: 'static', routeCount: routeIndex.length, fetchedAt: new Date().toISOString(), license: 'OpenStreetMap contributors, ODbL' } }));
  await writeFile(join(output, 'stop-index.json'), JSON.stringify({ data: [...stopIndex.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr')), meta: { source: 'metro-istanbul + openstreetmap', status: 'static', stopCount: stopIndex.size, fetchedAt: new Date().toISOString(), license: 'OpenStreetMap contributors, ODbL' } }));
}
console.log(`Generated ${routeIndex.length} static metro route record${routeIndex.length === 1 ? '' : 's'}${requestedCodes ? ' (scoped refresh)' : ` and ${stopIndex.size} searchable stations`}.`);
