import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import { readFileSync } from 'node:fs';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import hostingConfig from './.openai/hosting.json' with { type: 'json' };

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

const cloudflareRuntimeVars = {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://istanbulum.alper-apps.workers.dev',
  IETT_LIVE_CACHE_TTL_MS: process.env.IETT_LIVE_CACHE_TTL_MS ?? '30000',
  IETT_LIVE_STALE_TTL_MS: process.env.IETT_LIVE_STALE_TTL_MS ?? '600000',
  IETT_LIVE_TIMEOUT_MS: process.env.IETT_LIVE_TIMEOUT_MS ?? '10000',
  IETT_LIVE_FAILURE_BACKOFF_MS: process.env.IETT_LIVE_FAILURE_BACKOFF_MS ?? '15000',
  IETT_LIVE_MAX_REQUESTS_PER_HOUR: process.env.IETT_LIVE_MAX_REQUESTS_PER_HOUR ?? '360',
  IETT_LIVE_MAX_CACHE_ENTRIES: process.env.IETT_LIVE_MAX_CACHE_ENTRIES ?? '900',
  IETT_LIVE_MAX_RESPONSE_BYTES: process.env.IETT_LIVE_MAX_RESPONSE_BYTES ?? '1000000',
};

// MapLibre's worker imports this sibling with a stable relative URL. Vinext
// emits the worker itself for `?url`, but does not discover that nested module.
// Keep the sibling at the exact location expected by the emitted worker.
function maplibreWorkerSharedAsset() {
  return {
    name: 'maplibre-worker-shared-asset',
    apply: 'build' as const,
    generateBundle(this: { emitFile: (asset: { type:'asset'; fileName:string; source:string }) => void }) {
      this.emitFile({
        type: 'asset',
        fileName: '_next/static/media/maplibre-gl-shared.mjs',
        source: readFileSync(new URL('./node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs', import.meta.url), 'utf8'),
      });
    },
  };
}

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: 'vinext/server/app-router-entry',
  compatibility_flags: ['nodejs_compat'],
  vars: cloudflareRuntimeVars,
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    optimizeDeps: { exclude: ['maplibre-gl'] },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      maplibreWorkerSharedAsset(),
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});
