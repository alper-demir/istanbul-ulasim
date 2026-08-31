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
  label: 'İBB Açık Veri Deniz Ulaşım Hatları Vektör Verisi',
  url: 'https://data.ibb.gov.tr/dataset/deniz-ulasim-hatlari-vektor-verisi',
  shapesUrl: 'https://data.ibb.gov.tr/dataset/7b7ab555-4363-4522-b4e4-353c266906d9/resource/fea04c55-7d53-4432-a7fc-b94899c109d8/download/deniz_hat_verisi.geojson',
  publishedAt: '2025-06-05',
};
const vectorRouteKeys = {
  769: 'Beşiktaş-Adalar', 168: 'Anadolu Kavağı-Rumeli Kavağı-Sarıyer', 172: 'Anadolu Kavağı-Üsküdar',
  2014: 'Aşiyan-Anadolu Hisarı-Küçüksu', 595: 'Bebek-Emirgan', 2019: 'Beşiktaş-Eyüpsultan',
  767: 'Beykoz-Sarıyer', 167: 'Boğazdan Geliş-Boğaza Gidiş', 770: 'Bostancı-Adalar Ring',
  2024: 'Bostancı-Moda-Karaköy-Kabataş', 895: 'Bostancı-Büyükada-Sedef Adası', 170: 'Çengelköy-İstinye',
  2021: 'Çengelköy-Kabataş', 3598: 'İstinye-Çubuklu (Arabalı Vapur)', 177: 'Kabataş-Adalar',
  165: 'Kadıköy-Beşiktaş', 2017: 'Kadıköy-Eyüpsultan', 766: 'Kadıköy-Kabataş',
  768: 'Kadıköy-Karaköy-Beşiktaş', 163: 'Kadıköy-Karaköy-Eminönü', 171: 'Kadıköy-Sarıyer',
  169: 'Küçüksu-Beşiktaş-Kabataş', 175: 'Küçüksu-İstinye', 2020: 'Maltepe-Adalar',
  2078: 'Ortaköy-Beşiktaş-Eminönü', 173: 'Ortaköy-Üsküdar-Kadıköy', 174: 'Rumeli Kavağı-Eminönü',
  2015: 'Üsküdar-Aşiyan', 37: 'Üsküdar-Eyüpsultan (Haliç Hattı)', 164: 'Üsküdar-Karaköy-Eminönü',
};

async function fetchHtml(url) {
  const response = await fetch(url, { headers: requestHeaders, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
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

function projectedDistanceMeters(point, projected) {
  return Math.sqrt(distanceSquared(point, projected)) * 111_000;
}

function nearestDistanceMeters(point, coordinates) {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];
    const longitude = (point[0] - start[0]) * Math.cos((point[1] + start[1]) * Math.PI / 360);
    const latitude = point[1] - start[1];
    const dx = (end[0] - start[0]) * Math.cos((end[1] + start[1]) * Math.PI / 360);
    const dy = end[1] - start[1];
    const ratio = Math.max(0, Math.min(1, (longitude * dx + latitude * dy) / (dx * dx + dy * dy || 1)));
    const projected = [start[0] + ratio * (end[0] - start[0]), start[1] + ratio * (end[1] - start[1])];
    nearest = Math.min(nearest, projectedDistanceMeters(point, projected));
  }
  return nearest;
}

async function loadGtfsShapes() {
  const response = await fetch(gtfsSource.shapesUrl, { headers: requestHeaders, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${gtfsSource.shapesUrl} returned ${response.status}`);
  const payload = await response.json();
  return payload.features
    .filter((feature) => feature.properties?.TUR_HAT === 'Şehir Hatları' && feature.geometry?.type === 'LineString')
    .map((feature) => ({ shapeId: feature.properties.ISIM_HAT, route: { route_long_name: feature.properties.HAT_ROTA }, coordinates: feature.geometry.coordinates }))
    .filter((shape) => shape.coordinates.length >= 3);
}

function matchGtfsShape(routeName, direction, candidates) {
  const start = direction.stops[0].coordinates;
  const end = direction.stops.at(-1).coordinates;
  const scored = candidates.map((candidate) => {
    const first = candidate.coordinates[0];
    const last = candidate.coordinates.at(-1);
    const direct = distanceSquared(start, first) + distanceSquared(end, last);
    const reverse = distanceSquared(start, last) + distanceSquared(end, first);
    const isReversed = reverse < direct;
    const coordinates = isReversed ? [...candidate.coordinates].reverse() : candidate.coordinates;
    const stopDistances = direction.stops.map((stop) => nearestDistanceMeters(stop.coordinates, coordinates));
    const maxStopDistance = Math.max(...stopDistances);
    const averageStopDistance = stopDistances.reduce((sum, distance) => sum + distance, 0) / stopDistances.length;
    const coverageScore = Math.max(0, 1 - (averageStopDistance / 1_500)) * Math.max(0, 1 - (maxStopDistance / 4_000));
    return { candidate: { ...candidate, coordinates }, endpointScore: Math.max(0, 1 - Math.sqrt(Math.min(direct, reverse)) / 0.12), maxStopDistance, averageStopDistance, score: nameScore(routeName, candidate.route.route_long_name) * 0.25 + coverageScore * 0.75 };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  // Candidates are pre-filtered by the current İBB vector route key. This is
  // authoritative geometry, unlike the retired generic GTFS shapes.
  return best ?? null;
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
    const mappedRouteKey = vectorRouteKeys[routeNumber];
    const matchedShape = mappedRouteKey ? matchGtfsShape(name, directionData, gtfsShapes.filter((shape) => shape.shapeId === mappedRouteKey)) : null;
    if (matchedShape) {
      directionData.coordinates = matchedShape.candidate.coordinates;
      directionData.geometrySource = 'ibb-gtfs-shape';
      directionData.geometrySourceUpdatedAt = gtfsSource.publishedAt;
      directionData.geometrySourceUrl = gtfsSource.shapesUrl;
    } else directionData.geometrySource = 'schematic-stop-connection';
    directions.push(directionData);
  }
  if (!directions.some((direction) => direction.geometrySource === 'ibb-gtfs-shape')) {
    console.warn(`Skipping ferry route without published vector geometry: ${sourceUrl}`);
    continue;
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
