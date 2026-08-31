import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { iettRouteFareMapping } from './iett-fare-mappings.mjs';

const root = process.cwd();
const catalog = JSON.parse(await readFile(join(root, 'data', 'fares', 'istanbulkart-2026-07-20.json'), 'utf8'));
const profiles = new Map(catalog.profiles.map((profile) => [profile.id, profile]));
const sources = new Map(catalog.sources.map((source) => [source.id, source]));

export function fareForRoute(routeId) {
  const network = routeId.split(':', 1)[0];
  const mapping = catalog.routeProfiles[routeId] ?? (network === 'iett' ? iettRouteFareMapping(routeId) : null) ?? catalog.fallbackProfiles[network];
  const profile = mapping && profiles.get(mapping.profileId);
  const source = mapping && sources.get(mapping.sourceId);
  if (!mapping || !profile || !source) throw new Error(`No fare profile found for ${routeId}`);
  return {
    fareLabel: profile.shortLabel,
    fareProfileId: profile.id,
    fareVerification: mapping.verification,
    fareSourceUrl: source.url,
    fareEffectiveFrom: catalog.effectiveFrom,
    fareVerifiedAt: catalog.verifiedAt,
  };
}
