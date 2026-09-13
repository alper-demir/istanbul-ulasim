import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function entries(manifest) {
  if (!manifest?.data?.routes || typeof manifest.data.routes !== 'object') throw new Error('Manifest data.routes nesnesi içermeli');
  return manifest.data.routes;
}

function sourceShape(entry) {
  return {
    provider: entry.provider,
    url: entry.url,
    effectiveFrom: entry.effectiveFrom ?? null,
    effectiveTo: entry.effectiveTo ?? null,
    validityUnknown: Boolean(entry.validityUnknown),
  };
}

export function summarizeSchedulePayload(payload) {
  const data = payload?.data ?? {};
  const directions = Array.isArray(data.directions) ? data.directions : [];
  return {
    directionCount: directions.length,
    directions: directions.map((direction) => ({
      id: direction.directionId,
      scope: direction.scope ?? 'full-route',
      stopCount: Array.isArray(direction.stopIds) ? direction.stopIds.length : undefined,
      patternCount: Array.isArray(direction.patterns) ? direction.patterns.length : 0,
      journeyCounts: Array.isArray(direction.patterns) ? direction.patterns.map((pattern) => ({ id: pattern.id, dayTypeId: pattern.dayTypeId, count: Array.isArray(pattern.journeys) ? pattern.journeys.length : 0 })) : [],
      firstLast: Array.isArray(direction.patterns) ? direction.patterns.flatMap((pattern) => (pattern.journeys ?? []).flatMap((journey) => journey.calls?.[0]?.time ? [journey.calls[0].time] : [])).slice(0, 2) : [],
    })),
  };
}

export function diffSchedulePayloads(before, after) {
  const left = summarizeSchedulePayload(before);
  const right = summarizeSchedulePayload(after);
  return { before: left, after: right, changed: JSON.stringify(left) !== JSON.stringify(right) };
}

export function diffScheduleRouteMaps(beforeRoutes = {}, afterRoutes = {}) {
  const routeIds = [...new Set([...Object.keys(beforeRoutes), ...Object.keys(afterRoutes)])].sort();
  const changedRoutes = [];
  for (const routeId of routeIds) {
    if (!(routeId in beforeRoutes) || !(routeId in afterRoutes)) continue;
    const diff = diffSchedulePayloads(beforeRoutes[routeId], afterRoutes[routeId]);
    if (!diff.changed) continue;
    const beforeDirections = new Map(diff.before.directions.map((direction) => [direction.id, direction]));
    const afterDirections = new Map(diff.after.directions.map((direction) => [direction.id, direction]));
    const addedDirections = [...afterDirections.keys()].filter((id) => !beforeDirections.has(id)).sort();
    const removedDirections = [...beforeDirections.keys()].filter((id) => !afterDirections.has(id)).sort();
    const changedDirections = [...afterDirections.keys()]
      .filter((id) => beforeDirections.has(id) && JSON.stringify(beforeDirections.get(id)) !== JSON.stringify(afterDirections.get(id)))
      .sort();
    const beforeJourneys = diff.before.directions.flatMap((direction) => direction.journeyCounts).reduce((sum, item) => sum + item.count, 0);
    const afterJourneys = diff.after.directions.flatMap((direction) => direction.journeyCounts).reduce((sum, item) => sum + item.count, 0);
    changedRoutes.push({ routeId, addedDirections, removedDirections, changedDirections, beforeJourneyCount: beforeJourneys, afterJourneyCount: afterJourneys, contentDiff: diff });
  }
  return {
    changedRoutes,
    summary: { changedRouteCount: changedRoutes.length, addedDirectionCount: changedRoutes.reduce((sum, item) => sum + item.addedDirections.length, 0), removedDirectionCount: changedRoutes.reduce((sum, item) => sum + item.removedDirections.length, 0) },
    reviewReasons: changedRoutes.map((item) => `${item.routeId}: sefer/yön özeti değişti`),
    requiresReview: changedRoutes.length > 0,
  };
}

export function diffScheduleManifests(before, after) {
  const beforeRoutes = entries(before);
  const afterRoutes = entries(after);
  const beforeIds = Object.keys(beforeRoutes);
  const afterIds = Object.keys(afterRoutes);
  const addedRoutes = afterIds.filter((id) => !(id in beforeRoutes)).sort();
  const removedRoutes = beforeIds.filter((id) => !(id in afterRoutes)).sort();
  const changedSources = afterIds.filter((id) => id in beforeRoutes && JSON.stringify(sourceShape(beforeRoutes[id])) !== JSON.stringify(sourceShape(afterRoutes[id])))
    .map((id) => ({ routeId: id, before: sourceShape(beforeRoutes[id]), after: sourceShape(afterRoutes[id]) }))
    .sort((left, right) => left.routeId.localeCompare(right.routeId));

  return {
    schemaVersion: 1,
    beforeGeneratedAt: before.data.generatedAt,
    afterGeneratedAt: after.data.generatedAt,
    summary: { beforeRouteCount: beforeIds.length, afterRouteCount: afterIds.length, addedRouteCount: addedRoutes.length, removedRouteCount: removedRoutes.length, changedSourceCount: changedSources.length },
    addedRoutes,
    removedRoutes,
    changedSources,
    reviewReasons: [
      ...addedRoutes.map((routeId) => `${routeId}: yeni hat`),
      ...removedRoutes.map((routeId) => `${routeId}: hat kaldırıldı`),
      ...changedSources.map((item) => `${item.routeId}: kaynak/geçerlilik metadata değişti`),
    ],
    requiresReview: addedRoutes.length + removedRoutes.length + changedSources.length > 0,
  };
}

async function main() {
  const args = new Map(process.argv.slice(2).map((argument) => argument.replace(/^--/, '').split('=')));
  const beforePath = args.get('before');
  const afterPath = args.get('after');
  const outputPath = args.get('output');
  if (!beforePath || !afterPath || !outputPath) throw new Error('Kullanım: --before=önceki.json --after=yeni.json --output=rapor.json');
  const [before, after] = await Promise.all([readFile(resolve(beforePath), 'utf8'), readFile(resolve(afterPath), 'utf8')]);
  const report = diffScheduleManifests(JSON.parse(before), JSON.parse(after));
  await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Snapshot fark raporu yazıldı: ${report.summary.addedRouteCount} eklendi, ${report.summary.removedRouteCount} silindi, ${report.summary.changedSourceCount} kaynak değişti.`);
  if (report.requiresReview) process.exitCode = 2;
}

if (process.argv[1]?.endsWith('schedule-snapshot-diff.mjs')) await main();
