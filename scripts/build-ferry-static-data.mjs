import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const output = join(root, 'public', 'ferry');
const baseUrl = 'https://sehirhatlari.istanbul';
const catalogUrl = `${baseUrl}/tr/seferler`;
const fetchedAt = new Date().toISOString();
const requestHeaders = { 'user-agent': 'istanbulum-static-data-builder/0.7.0' };
const unlocatedPiers = new Set();
const gtfsSource = {
  label: 'İBB Açık Veri GTFS (tarihsel shape geometrisi)',
  url: 'https://data.ibb.gov.tr/dataset/public-transport-gtfs-data',
  shapesUrl: 'https://data.ibb.gov.tr/dataset/121a9892-7945-419a-9b89-49f6083926df/resource/83317085-aa56-41b0-9447-ea579567f2cb/download/shapes.csv',
  publishedAt: '2024-03-13',
};

async function fetchHtml(url) {
  const response = await fetch(url, { headers: requestHeaders, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

async function fetchCsv(url) {
  const response = await fetch(url, { headers: requestHeaders, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return new TextDecoder('windows-1254').decode(await response.arrayBuffer());
}

function parseCsv(text) {
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) { row.push(value); value = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value); value = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else value += character;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const headers = rows.shift().map((header) => header.replace(/^\uFEFF/, ''));
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
}

function normalizeText(value) {
  return value.toLocaleUpperCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/İ/g, 'I').replace(/[^A-Z0-9]+/g, ' ').trim();
}

function nameScore(left, right) {
  const ignored = new Set(['HATTI', 'RING', 'RINGI', 'VE', 'DAN', 'DEN', 'GELIS', 'GIDIS']);
  const a = new Set(normalizeText(left).split(/\s+/).filter((token) => token.length > 2 && !ignored.has(token)));
  const b = new Set(normalizeText(right).split(/\s+/).filter((token) => token.length > 2 && !ignored.has(token)));
  if (!a.size || !b.size) return 0;
  return [...a].filter((token) => b.has(token)).length * 2 / (a.size + b.size);
}

function distanceSquared(a, b) {
  const longitude = (a[0] - b[0]) * Math.cos((a[1] + b[1]) * Math.PI / 360);
  const latitude = a[1] - b[1];
  return longitude ** 2 + latitude ** 2;
}

async function loadGtfsShapes() {
  const routes = parseCsv(await fetchCsv('https://data.ibb.gov.tr/dataset/121a9892-7945-419a-9b89-49f6083926df/resource/36b554c7-cae0-4b7e-978f-fc6a43664e88/download/routes.csv'));
  const trips = parseCsv(await fetchCsv('https://data.ibb.gov.tr/dataset/121a9892-7945-419a-9b89-49f6083926df/resource/dcee1700-e59f-4a5f-8009-f602045a4507/download/trips.csv'));
  const shapes = parseCsv(await fetchCsv(gtfsSource.shapesUrl));
  const routeById = new Map(routes.filter((route) => route.agency_id === '6' && route.route_type === '4').map((route) => [route.route_id, route]));
  const routeIdsByShape = new Map();
  trips.forEach((trip) => { if (routeById.has(trip.route_id) && trip.shape_id) routeIdsByShape.set(trip.shape_id, trip.route_id); });
  const pointsByShape = new Map();
  shapes.forEach((point) => {
    if (!routeIdsByShape.has(point.shape_id)) return;
    const coordinates = [Number(point.shape_pt_lon), Number(point.shape_pt_lat)];
    if (!coordinates.every(Number.isFinite)) return;
    const points = pointsByShape.get(point.shape_id) ?? [];
    points.push({ sequence: Number(point.shape_pt_sequence), coordinates });
    pointsByShape.set(point.shape_id, points);
  });
  return [...pointsByShape.entries()].map(([shapeId, points]) => {
    points.sort((a, b) => a.sequence - b.sequence);
    const route = routeById.get(routeIdsByShape.get(shapeId));
    return { shapeId, route, coordinates: points.map((point) => point.coordinates) };
  }).filter((shape) => shape.coordinates.length >= 3);
}

function matchGtfsShape(routeName, direction, candidates) {
  const start = direction.stops[0].coordinates;
  const end = direction.stops.at(-1).coordinates;
  const scored = candidates.map((candidate) => {
    const first = candidate.coordinates[0];
    const last = candidate.coordinates.at(-1);
    const direct = distanceSquared(start, first) + distanceSquared(end, last);
    const reverse = distanceSquared(start, last) + distanceSquared(end, first);
    const endpointScore = Math.max(0, 1 - Math.sqrt(Math.min(direct, reverse)) / 0.12);
    return { candidate, endpointScore, score: nameScore(routeName, candidate.route.route_long_name) * 0.65 + endpointScore * 0.35 };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  return best && best.score >= 0.30 && best.endpointScore >= 0.45 ? best : null;
}

function decodeHtml(value) {
  return value
    .replaceAll('&Ouml;', 'Ö').replaceAll('&ouml;', 'ö')
    .replaceAll('&Uuml;', 'Ü').replaceAll('&uuml;', 'ü')
    .replaceAll('&Ccedil;', 'Ç').replaceAll('&ccedil;', 'ç')
    .replaceAll('&Scedil;', 'Ş').replaceAll('&scedil;', 'ş')
    .replaceAll('&Iacute;', 'İ').replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&').replaceAll('&#39;', "'").replaceAll('&quot;', '"');
}

function cleanText(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function titleCase(value) {
  return value.toLocaleLowerCase('tr-TR').split(/(\s+|—|-)/).map((part) => {
    const first = part[0];
    return first && /\p{L}/u.test(first) ? first.toLocaleUpperCase('tr-TR') + part.slice(1) : part;
  }).join('').replaceAll('İdo', 'İDO');
}

function routeNameFromPage(html, fallback) {
  const heading = cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? fallback);
  return titleCase(heading.replace(/\s+HATTI$/iu, '').replace(/\s*-\s*/g, ' — '));
}

function parseStops(section) {
  return [...section.matchAll(/<div tabindex="0" class="route-branch-stop-name">([\s\S]*?)<\/div>[\s\S]*?<a target="_blank" href="(\/tr\/iskeleler\/[^"]+)"/gi)]
    .map((match) => ({ name: cleanText(match[1]), href: match[2] }));
}

function parseDirections(html) {
  const goingStart = html.indexOf('stop-box-list-content box-going');
  const returnStart = html.indexOf('stop-box-list-content box-return');
  if (goingStart < 0 || returnStart < 0) return [];
  const scriptStart = html.indexOf('<script', returnStart);
  const outbound = parseStops(html.slice(goingStart, returnStart));
  const returning = parseStops(html.slice(returnStart, scriptStart > returnStart ? scriptStart : html.length));
  return [
    { id: 'outbound', stops: outbound },
    { id: 'return', stops: returning },
  ].filter((direction) => direction.stops.length >= 2);
}

const pierPromises = new Map();
async function getPier(stop) {
  if (!pierPromises.has(stop.href)) {
    pierPromises.set(stop.href, fetchHtml(`${baseUrl}${stop.href}`).then((html) => {
      const embeddedMap = html.match(/!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/);
      const queryMap = html.match(/maps\.google\.com\/maps\?[^"']*?q=(-?\d+(?:\.\d+)?)(?:,|%2C)(-?\d+(?:\.\d+)?)/i);
      const coordinates = embeddedMap
        ? [Number(embeddedMap[1]), Number(embeddedMap[2])]
        : queryMap
          ? [Number(queryMap[2]), Number(queryMap[1])]
          : null;
      if (!coordinates) {
        unlocatedPiers.add(stop.href);
        console.warn(`Pier coordinate not published; omitted from schematic geometry: ${stop.href}`);
        return null;
      }
      const slug = stop.href.split('/').at(-1);
      return {
        id: `ferry-stop:${slug}`,
        name: stop.name,
        district: 'İstanbul',
        coordinates,
      };
    }));
  }
  return pierPromises.get(stop.href);
}

const catalog = await fetchHtml(catalogUrl);
const gtfsShapes = await loadGtfsShapes();
const routeLinks = [...new Set([...catalog.matchAll(/href="(\/tr\/seferler\/ic-hatlar\/(?:istanbul-ici-hatlar|bogaz-hatlari|adalar-hatlari)\/[^"#]+)"/gi)].map((match) => match[1]))];
if (routeLinks.length < 25) throw new Error(`Expected at least 25 Şehir Hatları routes, received ${routeLinks.length}`);

await mkdir(join(output, 'routes'), { recursive: true });
const routeIndex = [];
const stopIndex = new Map();

for (const link of routeLinks) {
  const sourceUrl = `${baseUrl}${link}`;
  const html = await fetchHtml(sourceUrl);
  const parsedDirections = parseDirections(html);
  if (!parsedDirections.length) throw new Error(`Ferry stop sequence not found: ${sourceUrl}`);
  const routeNumber = link.match(/-(\d+)$/)?.[1];
  if (!routeNumber) throw new Error(`Stable route id not found: ${link}`);
  const name = routeNameFromPage(html, link);
  const directions = [];
  for (const direction of parsedDirections) {
    const stops = (await Promise.all(direction.stops.map(getPier))).filter(Boolean);
    if (stops.length < 2) throw new Error(`Fewer than two mapped piers: ${sourceUrl}`);
    const directionData = {
      id: direction.id,
      name: `${stops[0].name} → ${stops.at(-1).name}`,
      durationMinutes: 0,
      coordinates: stops.map((stop) => stop.coordinates),
      stops,
    };
    const matchedShape = matchGtfsShape(name, directionData, gtfsShapes);
    if (matchedShape) {
      directionData.coordinates = matchedShape.candidate.coordinates;
      directionData.geometrySource = 'ibb-gtfs-shape';
      directionData.geometrySourceUpdatedAt = gtfsSource.publishedAt;
      directionData.geometrySourceUrl = gtfsSource.shapesUrl;
    } else directionData.geometrySource = 'schematic-stop-connection';
    directions.push(directionData);
  }
  const primary = directions.find((direction) => direction.id === 'outbound') ?? directions[0];
  const route = {
    id: `ferry:${routeNumber}`,
    code: 'Vapur',
    name,
    color: '#1686c9',
    mode: 'Vapur',
    operator: 'Şehir Hatları',
    source: 'sehir-hatlari',
    sourceLabel: 'Şehir Hatları',
    sourceUrl,
    sourceUpdatedAt: fetchedAt,
    geometrySource: directions.some((direction) => direction.geometrySource === 'ibb-gtfs-shape') ? gtfsSource.label : 'Şehir Hatları iskele koordinatları',
    geometrySourceUpdatedAt: directions.some((direction) => direction.geometrySource === 'ibb-gtfs-shape') ? gtfsSource.publishedAt : fetchedAt.slice(0, 10),
    geometrySourceUrl: directions.some((direction) => direction.geometrySource === 'ibb-gtfs-shape') ? gtfsSource.shapesUrl : sourceUrl,
    supportsLiveVehicles: false,
    fareLabel: 'Hat bazlı tarife bilgisi yakında eklenecek',
    durationMinutes: 0,
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
  await writeFile(join(output, 'routes', `${routeNumber}.json`), JSON.stringify({
    data: route,
    meta: { source: 'Şehir Hatları + İBB Açık Veri GTFS', status: 'static', geometry: route.geometrySource, fetchedAt, officialUrl: sourceUrl, geometrySource: route.geometrySource, geometrySourceUpdatedAt: route.geometrySourceUpdatedAt, geometrySourceUrl: route.geometrySourceUrl },
  }));
}

routeIndex.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
await writeFile(join(output, 'route-index.json'), JSON.stringify({ data: routeIndex, meta: { source: 'Şehir Hatları + İBB Açık Veri GTFS', status: 'static', geometry: 'ibb-gtfs-shape-with-schematic-fallback', routeCount: routeIndex.length, unlocatedPierCount: unlocatedPiers.size, fetchedAt, officialUrl: catalogUrl, geometrySource: gtfsSource.label, geometrySourceUpdatedAt: gtfsSource.publishedAt, geometrySourceUrl: gtfsSource.shapesUrl } }));
await writeFile(join(output, 'stop-index.json'), JSON.stringify({ data: [...stopIndex.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr')), meta: { source: 'Şehir Hatları', status: 'static', stopCount: stopIndex.size, unlocatedPierCount: unlocatedPiers.size, fetchedAt, officialUrl: catalogUrl } }));
console.log(`Generated ${routeIndex.length} static ferry routes and ${stopIndex.size} searchable piers.`);
