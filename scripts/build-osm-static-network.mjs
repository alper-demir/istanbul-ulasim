import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fareForRoute } from './fare-catalog.mjs';

const root = process.cwd();
const network = process.argv[2];
if (!network) throw new Error('Usage: node scripts/build-osm-static-network.mjs <network>');

const manifestPath = join(root, 'data', network, 'lines.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const requestedCodes = (process.argv.find((argument) => argument.startsWith('--codes='))?.slice(8).split(',').map((code) => code.trim().toUpperCase()).filter(Boolean) ?? null);
const lines = requestedCodes ? manifest.lines.filter((line) => requestedCodes.includes(line.code)) : manifest.lines;
if (!lines.length || requestedCodes?.some((code) => !lines.some((line) => line.code === code))) throw new Error('İstenen hat veri kataloğunda bulunamadı');
const output = join(root, 'public', network);
const endpoint = 'https://overpass-api.de/api/interpreter';
const unique = (values) => [...new Set(values)];
const sourceUpdatedAt = new Date().toISOString();

async function requestRelations(ids) {
  const query = `[out:json][timeout:120];relation(id:${ids.join(',')});out geom;>;out geom qt;`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'user-agent': 'istanbulum-static-data-builder/0.7.0' },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(150_000),
  });
  if (!response.ok) throw new Error(`OpenStreetMap snapshot failed (${response.status})`);
  return (await response.json()).elements;
}

const allRelationIds = unique(lines.flatMap((line) => line.directions.flatMap((direction) => direction.relationIds)));
const elements = await requestRelations(allRelationIds);
const relationById = new Map(elements.filter((item) => item.type === 'relation').map((item) => [item.id, item]));
const nodeById = new Map(elements.filter((item) => item.type === 'node').map((item) => [item.id, item]));
const wayById = new Map(elements.filter((item) => item.type === 'way').map((item) => [item.id, item]));
const acceptedStopRoles = new Set(['stop', 'platform', 'stop_entry_only', 'stop_exit_only']);

function stationFromMember(member) {
  if (!acceptedStopRoles.has(member.role)) return null;
  const overrideName = manifest.stationNameOverrides?.[member.ref];
  if (member.type === 'way' && overrideName) {
    const way = wayById.get(member.ref);
    const geometry = (way?.geometry ?? []).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
    if (!geometry.length) return null;
    const latitude = geometry.reduce((sum, point) => sum + point.lat, 0) / geometry.length;
    const longitude = geometry.reduce((sum, point) => sum + point.lon, 0) / geometry.length;
    return { id: `${network}-stop:osm:${member.ref}`, name: overrideName, district: 'İstanbul', coordinates: [longitude, latitude] };
  }
  if (member.type !== 'node') return null;
  const node = nodeById.get(member.ref);
  const name = node?.tags?.name?.trim() ?? overrideName;
  if (!node || !name || !Number.isFinite(node.lat) || !Number.isFinite(node.lon)) return null;
  return {
    id: `${network}-stop:osm:${member.ref}`,
    name,
    district: node.tags?.['addr:district'] ?? node.tags?.['addr:suburb'] ?? 'İstanbul',
    coordinates: [node.lon, node.lat],
  };
}

function stationsForRelations(ids) {
  const stations = [];
  for (const id of ids) {
    const relation = relationById.get(id);
    if (!relation) throw new Error(`OSM relation ${id} is missing from the snapshot`);
    for (const member of relation.members ?? []) {
      const station = stationFromMember(member);
      if (!station || stations.at(-1)?.id === station.id) continue;
      stations.push(station);
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
  if (!primary || actualCount < Math.ceil(line.minimumStopCount * 0.8)) {
    throw new Error(`${line.code}: expected about ${line.minimumStopCount} stations, received ${actualCount}`);
  }
  if (actualCount < line.minimumStopCount) console.warn(`${line.code}: OSM has ${actualCount}/${line.minimumStopCount} expected stations`);
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
    return { ...direction, durationMinutes: line.durationMinutes ?? 0, coordinates: geometryForRelations(direction.relationIds, stops.map((stop) => stop.coordinates)), stops };
  });
  for (const direction of directions) {
    if (!direction.reverseStopsOf) continue;
    const sourceDirection = directions.find((candidate) => candidate.id === direction.reverseStopsOf);
    if (!sourceDirection) throw new Error(`${line.code}: reverse stop source ${direction.reverseStopsOf} was not found`);
    direction.stops = [...sourceDirection.stops].reverse();
  }
  validateLine(line, directions);
  const primary = directions.find((direction) => direction.id === 'outbound') ?? directions[0];
  const route = {
    id: `${network}:${line.code}`,
    code: line.code,
    name: line.name,
    color: line.color,
    mode: line.mode,
    operator: line.operator,
    source: line.source,
    sourceLabel: line.sourceLabel,
    sourceUrl: line.officialUrl,
    sourceUpdatedAt,
    supportsLiveVehicles: false,
    ...fareForRoute(`${network}:${line.code}`),
    durationMinutes: primary.durationMinutes,
    coordinates: primary.coordinates,
    stops: primary.stops,
    vehicles: [],
    directions,
  };
  routeIndex.push({ ...route, coordinates: undefined, stops: undefined, vehicles: undefined, directions: undefined, vehicleCount: 0, stopCount: primary.stops.length });
  for (const direction of directions) {
    direction.stops.forEach((stop, index) => {
      const entry = stopIndex.get(stop.id) ?? { ...stop, routes: [] };
      if (!entry.routes.some(([routeId, directionId]) => routeId === route.id && directionId === direction.id)) entry.routes.push([route.id, direction.id, index + 1]);
      stopIndex.set(stop.id, entry);
    });
  }
  await writeFile(join(output, 'routes', `${encodeURIComponent(line.code)}.json`), JSON.stringify({
    data: route,
    meta: { source: line.sourceLabel, status: 'static', fetchedAt: sourceUpdatedAt, officialUrl: line.officialUrl, license: 'OpenStreetMap contributors, ODbL' },
  }));
}

if (!requestedCodes) {
  routeIndex.sort((a, b) => a.code.localeCompare(b.code, 'tr'));
  await writeFile(join(output, 'route-index.json'), JSON.stringify({ data: routeIndex, meta: { source: manifest.label, status: 'static', routeCount: routeIndex.length, fetchedAt: sourceUpdatedAt, license: 'OpenStreetMap contributors, ODbL' } }));
  await writeFile(join(output, 'stop-index.json'), JSON.stringify({ data: [...stopIndex.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr')), meta: { source: manifest.label, status: 'static', stopCount: stopIndex.size, fetchedAt: sourceUpdatedAt, license: 'OpenStreetMap contributors, ODbL' } }));
}
console.log(`Generated ${routeIndex.length} ${network} route record${routeIndex.length === 1 ? '' : 's'}${requestedCodes ? ' (scoped refresh)' : ` and ${stopIndex.size} searchable stops`}.`);
