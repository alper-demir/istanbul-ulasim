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
