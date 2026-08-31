import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const routeIndexPath = join(root, 'public', 'iett', 'route-index.json');
const outputPath = join(root, 'data', 'fares', 'snapshots', 'iett-route-tariffs.json');
const concurrency = 4;
const timeoutMs = 20_000;

const routeIndex = JSON.parse(await readFile(routeIndexPath, 'utf8'));
const routes = routeIndex.data ?? [];

function extractTariff(html) {
  const match = html.match(/Tarife Bilgisi\s*:<\/[^>]+>\s*([^<]+)/i)
    ?? html.match(/Tarife Bilgisi\s*:\s*([^<\r\n]+)/i);
  return match?.[1]
    ?.replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
    .replace(/\s+/g, ' ')
    .trim() ?? null;
}

async function fetchTariff(route) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = `https://iett.istanbul/RouteDetail?hkod=${encodeURIComponent(route.code)}`;
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'Istanbulum fare audit (static snapshot)' },
      signal: controller.signal,
    });
    const html = await response.text();
    return {
      routeId: route.id,
      code: route.code,
      name: route.name,
      url,
      status: response.status,
      tariff: response.ok ? extractTariff(html) : null,
    };
  } catch (error) {
    return {
      routeId: route.id,
      code: route.code,
      name: route.name,
      url,
      status: 0,
      tariff: null,
      error: error instanceof Error ? error.message : 'Unknown request failure',
    };
  } finally {
    clearTimeout(timeout);
  }
}

const results = new Array(routes.length);
let cursor = 0;
async function worker() {
  while (cursor < routes.length) {
    const index = cursor++;
    results[index] = await fetchTariff(routes[index]);
    if ((index + 1) % 50 === 0 || index + 1 === routes.length) {
      console.log(`Audited ${index + 1}/${routes.length} IETT routes`);
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));

const summary = Object.groupBy(results, (entry) => entry.tariff ?? 'UNRESOLVED');
const payload = {
  schemaVersion: 1,
  retrievedAt: new Date().toISOString(),
  source: {
    label: 'İETT hat detayları',
    urlTemplate: 'https://iett.istanbul/RouteDetail?hkod={hatKodu}',
    purpose: 'Hat bazındaki tarife sınıfını statik olarak denetleme',
  },
  summary: Object.fromEntries(Object.entries(summary).map(([tariff, entries]) => [tariff, entries.length])),
  routes: results,
};

await mkdir(join(root, 'data', 'fares', 'snapshots'), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${results.length} route tariff records to ${outputPath}`);
