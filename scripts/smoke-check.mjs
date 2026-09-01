const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const dataVersion = '2026-08-31.3';

const checks = [
  ['application', '/'],
  ['health', '/api/v1/health'],
  ['bootstrap', '/api/v1/bootstrap'],
  ['source health', '/api/v1/source-health'],
  ['IETT route index', `/iett/route-index.json?v=${dataVersion}`],
  ['metro route index', `/metro/route-index.json?v=${dataVersion}`],
  ['rail route index', `/rail/route-index.json?v=${dataVersion}`],
  ['ferry route index', `/ferry/route-index.json?v=${dataVersion}`],
  ['invalid live request', '/api/v1/live-vehicles?route=invalid%20route'],
];

for (const [name, path] of checks) {
  const response = await fetch(`${baseUrl}${path}`, { signal:AbortSignal.timeout(10_000) });
  const expectedStatus = name === 'invalid live request' ? 400 : 200;
  if (response.status !== expectedStatus) throw new Error(`${name}: beklenen ${expectedStatus}, alınan ${response.status}`);
  if (name === 'source health') {
    const payload = await response.json();
    if (!payload.metrics?.liveVehicles) throw new Error('source health: canlı metrikleri eksik');
  }
  console.log(`✓ ${name}: ${response.status}`);
}

console.log(`Smoke kontrolü başarılı: ${checks.length} kontrol`);
