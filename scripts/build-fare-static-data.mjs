import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expandIettRouteMappings } from './iett-fare-mappings.mjs';

const root = process.cwd();
const sourcePath = join(root, 'data', 'fares', 'istanbulkart-2026-07-20.json');
const outputPath = join(root, 'public', 'fares', 'current.json');
const sourceCatalog = JSON.parse(await readFile(sourcePath, 'utf8'));
const catalog = { ...sourceCatalog, routeProfiles: expandIettRouteMappings(sourceCatalog.routeProfiles) };

const profileIds = new Set(catalog.profiles.map((profile) => profile.id));
const sourceIds = new Set(catalog.sources.map((source) => source.id));
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

if (catalog.schemaVersion !== 1) throw new Error(`Unsupported fare schema: ${catalog.schemaVersion}`);
if (!isDate(catalog.effectiveFrom) || !isDate(catalog.verifiedAt)) throw new Error('Fare catalog must include ISO effectiveFrom and verifiedAt dates');
if (!Array.isArray(catalog.limitedUseTickets) || !catalog.limitedUseTickets.length) throw new Error('Fare catalog must include limited-use ticket prices');
for (const ticket of catalog.limitedUseTickets) {
  if (!Number.isInteger(ticket.priceKurus) || ticket.priceKurus < 0 || !Number.isInteger(ticket.passCount) || ticket.passCount < 1) {
    throw new Error(`Invalid limited-use ticket: ${ticket.label ?? 'unknown'}`);
  }
}
if (!Array.isArray(catalog.monthlyPasses) || !catalog.monthlyPasses.length) throw new Error('Fare catalog must include monthly pass prices');
for (const pass of catalog.monthlyPasses) {
  if (!Number.isInteger(pass.priceKurus) || pass.priceKurus < 0 || !Number.isInteger(pass.passCount) || pass.passCount < 1) {
    throw new Error(`Invalid monthly pass: ${pass.label ?? 'unknown'}`);
  }
}
for (const [routeId, mapping] of Object.entries(catalog.routeProfiles)) {
  if (!routeId.includes(':') || !profileIds.has(mapping.profileId) || !sourceIds.has(mapping.sourceId)) throw new Error(`Invalid route fare mapping: ${routeId}`);
}
for (const [network, mapping] of Object.entries(catalog.fallbackProfiles)) {
  if (!network || !profileIds.has(mapping.profileId) || !sourceIds.has(mapping.sourceId)) throw new Error(`Invalid fallback fare mapping: ${network}`);
}
for (const profile of catalog.profiles) {
  if (!['fixed', 'distance-bands', 'distance-based'].includes(profile.kind)) throw new Error(`Unsupported fare kind: ${profile.id}`);
  if (!sourceIds.has(profile.sourceId)) throw new Error(`Unknown fare source: ${profile.id}`);
  for (const price of Object.values(profile.pricesKurus ?? {})) {
    if (!Number.isInteger(price) || price < 0) throw new Error(`Invalid price for ${profile.id}`);
  }
}

await mkdir(join(root, 'public', 'fares'), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({ data: catalog, meta: { status: 'static', generatedAt: new Date().toISOString() } })}\n`);
console.log(`Generated ${catalog.profiles.length} fare profiles and ${Object.keys(catalog.routeProfiles).length} route-specific mappings.`);
