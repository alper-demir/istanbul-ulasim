import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const [snapshot, rules] = await Promise.all([
  readFile(join(root, 'data', 'fares', 'snapshots', 'iett-route-tariffs.json'), 'utf8').then(JSON.parse),
  readFile(join(root, 'data', 'fares', 'iett-route-tariff-rules.json'), 'utf8').then(JSON.parse),
]);

export function iettRouteFareMapping(routeId) {
  const route = snapshot.routes.find((entry) => entry.routeId === routeId);
  if (!route?.tariff) return null;
  const profileId = rules.routeOverrides[routeId] ?? rules.tariffProfiles[route.tariff];
  if (!profileId) return null;
  return {
    profileId,
    verification: 'route-verified',
    sourceId: 'iett-route-tariff-snapshot',
    note: `İETT hat detayında “${route.tariff}” olarak doğrulandı.`,
  };
}

export function expandIettRouteMappings(routeProfiles) {
  const expanded = { ...routeProfiles };
  for (const route of snapshot.routes) {
    if (route.tariff && !rules.routeOverrides[route.routeId] && !rules.tariffProfiles[route.tariff]) {
      throw new Error(`Unmapped IETT tariff class for ${route.routeId}: ${route.tariff}`);
    }
    const mapping = iettRouteFareMapping(route.routeId);
    if (mapping && !expanded[route.routeId]) expanded[route.routeId] = mapping;
  }
  return expanded;
}
