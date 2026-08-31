import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const output = join(root, 'public', 'ferry');
const baseUrl = 'https://sehirhatlari.istanbul';
const catalogUrl = `${baseUrl}/tr/seferler`;
const fetchedAt = new Date().toISOString();
const requestHeaders = { 'user-agent': 'istanbulum-static-data-builder/0.7.0' };
const unlocatedPiers = new Set();

async function fetchHtml(url) {
  const response = await fetch(url, { headers: requestHeaders, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
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
    directions.push({
      id: direction.id,
      name: `${stops[0].name} → ${stops.at(-1).name}`,
      durationMinutes: 0,
      coordinates: stops.map((stop) => stop.coordinates),
      stops,
    });
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
    meta: { source: 'Şehir Hatları', status: 'static', geometry: 'schematic', fetchedAt, officialUrl: sourceUrl },
  }));
}

routeIndex.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
await writeFile(join(output, 'route-index.json'), JSON.stringify({ data: routeIndex, meta: { source: 'Şehir Hatları', status: 'static', geometry: 'schematic', routeCount: routeIndex.length, unlocatedPierCount: unlocatedPiers.size, fetchedAt, officialUrl: catalogUrl } }));
await writeFile(join(output, 'stop-index.json'), JSON.stringify({ data: [...stopIndex.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr')), meta: { source: 'Şehir Hatları', status: 'static', stopCount: stopIndex.size, unlocatedPierCount: unlocatedPiers.size, fetchedAt, officialUrl: catalogUrl } }));
console.log(`Generated ${routeIndex.length} static ferry routes and ${stopIndex.size} searchable piers.`);
