import { readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const clientRoot = join(root, 'dist', 'client');
const reportRoot = join(root, 'data', 'reports');
const date = new Date().toISOString().slice(0, 10);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const files = await walk(clientRoot);
const all = await Promise.all(files.map(async (path) => ({ path: relative(clientRoot, path).replaceAll('\\', '/'), bytes: (await stat(path)).size })));
const js = all.filter((item) => item.path.endsWith('.js')).sort((left, right) => right.bytes - left.bytes);
const schedulesRoot = join(root, 'public', 'schedules', 'routes');
const scheduleFiles = (await readdir(schedulesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
const schedules = await Promise.all(scheduleFiles.map(async (entry) => ({ file: entry.name, bytes: (await stat(join(schedulesRoot, entry.name))).size })));
const routeOverBudget = schedules.filter((item) => item.bytes > 100 * 1024);
const report = {
  generatedAt: new Date().toISOString(),
  client: { totalBytes: all.reduce((sum, item) => sum + item.bytes, 0), javascriptBytes: js.reduce((sum, item) => sum + item.bytes, 0), largestJavaScript: js.slice(0, 10) },
  schedules: { routeCount: schedules.length, largest: schedules.sort((left, right) => right.bytes - left.bytes).slice(0, 10), routeOverBudget },
  budgets: { routeJsonBytes: 100 * 1024, routeJsonPassed: routeOverBudget.length === 0 },
};
await writeFile(join(reportRoot, `performance-${date}.json`), `${JSON.stringify(report, null, 2)}\n`);
const markdown = [`# Performance report — ${date}`, '', `- Client çıktısı: ${(report.client.totalBytes / 1024 / 1024).toFixed(2)} MB`, `- JavaScript: ${(report.client.javascriptBytes / 1024 / 1024).toFixed(2)} MB`, `- Rota snapshot sayısı: ${report.schedules.routeCount}`, `- Rota JSON bütçesi (100 KB): ${report.budgets.routeJsonPassed ? 'OK' : 'AŞILDI'}`, '', '## En büyük JavaScript parçaları', '', ...js.slice(0, 10).map((item) => `- ${item.path}: ${(item.bytes / 1024).toFixed(1)} KB`), '', '## En büyük sefer dosyaları', '', ...report.schedules.largest.map((item) => `- ${item.file}: ${(item.bytes / 1024).toFixed(1)} KB`)];
await writeFile(join(reportRoot, `performance-${date}.md`), `${markdown.join('\n')}\n`);
if (!report.budgets.routeJsonPassed) process.exitCode = 2;
console.log(`Performance raporu üretildi: ${report.schedules.routeCount} rota, ${routeOverBudget.length} bütçe ihlali.`);
