import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { diffScheduleManifests, diffSchedulePayloads } from './schedule-snapshot-diff.mjs';

const root = process.cwd();
const provider = process.argv.find((arg) => arg.startsWith('--provider='))?.slice(11) ?? process.env.npm_config_provider;
const apply = process.argv.includes('--apply');
const allowed = new Set(['iett', 'metro', 'tcdd', 'ferry', 'fares']);
if (!provider || !allowed.has(provider)) throw new Error('Kullanım: npm run data:refresh -- --provider=<iett|metro|tcdd|ferry|fares> [--apply]');

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
const manifestPath = join(root, 'public', 'schedules', 'manifest.json');
const before = JSON.parse(await readFile(manifestPath, 'utf8'));
async function routeState(manifest) {
  const state = {};
  for (const [routeId, entry] of Object.entries(manifest.data.routes ?? {})) {
    try {
      const raw = await readFile(join(root, 'public', entry.path.replace(/^\//, '')), 'utf8');
      state[routeId] = { hash: createHash('sha256').update(raw).digest('hex'), payload: JSON.parse(raw) };
    } catch { state[routeId] = { hash: null, payload: null }; }
  }
  return state;
}
const beforeRoutes = await routeState(before);
const after = JSON.parse(await readFile(manifestPath, 'utf8'));
let backupDirectory = null;
let applied = false;
if (apply) {
  backupDirectory = await mkdtemp(join(root, '.data-refresh-'));
  await cp(manifestPath, join(backupDirectory, 'manifest.json'));
  for (const entry of Object.values(before.data.routes ?? {})) {
    const source = join(root, 'public', entry.path.replace(/^\//, ''));
    try {
      const target = join(backupDirectory, 'routes', relative(join(root, 'public'), source));
      await mkdir(dirname(target), { recursive: true });
      await cp(source, target);
    } catch { /* An absent old route is handled by the diff. */ }
  }
  const command = { iett: 'data:build-iett-schedules', metro: 'data:build-metro-schedules', tcdd: 'data:build-tcdd-schedules', ferry: 'data:build-ferry', fares: 'data:build-fares' }[provider];
  await promisify(execFile)(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', command], { cwd: root, env: { ...process.env, CI: '1' }, maxBuffer: 8 * 1024 * 1024 });
}
const refreshed = JSON.parse(await readFile(manifestPath, 'utf8'));
const finalManifest = apply ? refreshed : after;
const afterRoutes = await routeState(finalManifest);
const changedRoutes = Object.keys(afterRoutes).filter((routeId) => beforeRoutes[routeId]?.hash !== afterRoutes[routeId]?.hash).map((routeId) => ({ routeId, hashChanged: true, contentDiff: beforeRoutes[routeId]?.payload && afterRoutes[routeId]?.payload ? diffSchedulePayloads(beforeRoutes[routeId].payload, afterRoutes[routeId].payload) : null }));
const review = diffScheduleManifests(before, finalManifest);
review.changedRouteCount = changedRoutes.length;
review.requiresReview = review.requiresReview || changedRoutes.length > 0;
const report = { provider, generatedAt: new Date().toISOString(), applyRequested: apply, note: apply ? 'Kaynak snapshot üretildi; farklar manuel incelemeye tabidir.' : 'Dry-run: mevcut snapshot incelendi, hiçbir kaynak çağrısı yapılmadı.', scheduleDiff: review, changedRoutes };
if (apply && review.requiresReview) {
  await cp(join(backupDirectory, 'manifest.json'), manifestPath);
  for (const entry of Object.values(before.data.routes ?? {})) {
    const source = join(root, 'public', entry.path.replace(/^\//, ''));
    const backup = join(backupDirectory, 'routes', relative(join(root, 'public'), source));
    try { await cp(backup, source); } catch { /* An absent old route remains absent. */ }
  }
  for (const [routeId, entry] of Object.entries(refreshed.data.routes ?? {})) {
    if (before.data.routes?.[routeId]) continue;
    await rm(join(root, 'public', entry.path.replace(/^\//, '')), { force: true });
  }
  report.applyReverted = true;
  report.note = 'Fark manuel inceleme gerektirdi; etkin snapshot geri alındı.';
} else {
  applied = apply;
  report.applied = applied;
}
const reportDirectory = join(root, 'data', 'reports');
await mkdir(reportDirectory, { recursive: true });
const reportPath = join(reportDirectory, `${provider}-${today}.json`);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
const markdown = [
  `# ${provider} snapshot bakım raporu`,
  '',
  `- Üretildi: ${report.generatedAt}`,
  `- Uygulama istendi: ${apply ? 'evet' : 'hayır'}`,
  `- Etkinleştirildi: ${report.applied ? 'evet' : 'hayır'}`,
  `- Geri alındı: ${report.applyReverted ? 'evet' : 'hayır'}`,
  `- Manuel inceleme: ${review.requiresReview ? 'gerekli' : 'gerekli değil'}`,
  '',
  '## Özet',
  '',
  `- Hat sayısı: ${review.summary.beforeRouteCount} → ${review.summary.afterRouteCount}`,
  `- Eklenen hatlar: ${review.addedRoutes.length || 'yok'}`,
  `- Silinen hatlar: ${review.removedRoutes.length || 'yok'}`,
  `- Kaynak değişimi: ${review.changedSources.length}`,
  `- İçerik hash değişimi: ${changedRoutes.length}`,
  '',
  '## Değişen rota dosyaları',
  '',
  ...(changedRoutes.length ? changedRoutes.map((item) => `- ${item.routeId}`) : ['- Yok']),
  '',
  '## Not',
  '',
  report.note,
  '',
].join('\n');
await writeFile(join(reportDirectory, `${provider}-${today}.md`), markdown);
if (backupDirectory) await rm(backupDirectory, { recursive: true, force: true });
console.log(`Bakım raporu yazıldı: ${reportPath}`);
if (report.scheduleDiff.requiresReview) process.exitCode = 2;
