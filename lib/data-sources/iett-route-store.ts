import type { TransitRoute } from '@/lib/transit-fixtures';
import { fareLabelForRoute, resolveFare } from '@/lib/fare-data';

type RawFeature = {
  properties: Record<string, string>;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
};

type RawDataset = { features: RawFeature[] };

export type TransitRouteSummary = Omit<TransitRoute, 'coordinates' | 'stops' | 'vehicles'> & {
  vehicleCount: number;
  stopCount: number;
};

let datasetPromise: Promise<RawDataset | null> | undefined;

async function readDataset() {
  if (!datasetPromise) {
    datasetPromise = Promise.all([import('node:fs/promises'), import('node:path')])
      .then(async ([{ readFile }, { join }]) => {
        const candidates = [
          join(process.cwd(), 'data', 'iett-hat-guzergahlari.geojson'),
          join(process.cwd(), 'apps', 'web', 'data', 'iett-hat-guzergahlari.geojson'),
        ];
        for (const path of candidates) {
          try { return await readFile(path, 'utf8'); } catch { /* try next deployment layout */ }
        }
        throw new Error('IETT route dataset not found');
      })
      .then((content) => JSON.parse(content) as RawDataset)
      .catch(() => null);
  }
  return datasetPromise;
}

function mode(code: string) {
  return /^34(?:A|AS|AV|BZ|C|G|Z)?$/i.test(code) ? 'Metrobüs' as const : 'Otobüs' as const;
}

function color(code: string) {
  if (mode(code) === 'Metrobüs') return '#f3a712';
  const palette = ['#087f8c', '#ef5b4c', '#277da1', '#7c3aed', '#db2777', '#16a34a'];
  return palette[[...code].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length];
}

function representative(features: RawFeature[]) {
  return features.find((feature) => feature.properties.DEPAR_NO === '0' && feature.properties.YON === 'GİDİŞ')
    ?? features.find((feature) => feature.properties.DEPAR_NO === '0')
    ?? features.reduce((longest, feature) => feature.geometry.coordinates.length > longest.geometry.coordinates.length ? feature : longest);
}

function toSummary(code: string, feature: RawFeature): TransitRouteSummary {
  const fare = resolveFare(`iett:${code}`);
  return {
    id: `iett:${code}`,
    code,
    name: feature.properties.HAT_ADI.trim().replace(/\s+-\s+/g, ' — '),
    color: color(code),
    mode: mode(code),
    fareLabel: fareLabelForRoute(`iett:${code}`),
    ...(fare ? {
      fareProfileId: fare.id,
      fareVerification: fare.verification,
      fareSourceUrl: fare.sourceUrl,
      fareEffectiveFrom: fare.effectiveFrom,
      fareVerifiedAt: fare.verifiedAt,
    } : {}),
    durationMinutes: Math.round(Number(feature.properties.SURE?.replace(',', '.')) / 60) || 0,
    vehicleCount: 0,
    stopCount: 0,
  };
}

async function groupedFeatures() {
  const dataset = await readDataset();
  if (!dataset) return null;
  const groups = new Map<string, RawFeature[]>();
  for (const feature of dataset.features) {
    const code = feature.properties.HAT_KODU?.trim();
    if (!code || feature.properties.DURUM !== '1' || feature.geometry?.type !== 'LineString') continue;
    groups.set(code, [...(groups.get(code) ?? []), feature]);
  }
  return groups;
}

export async function listIettRoutes() {
  const groups = await groupedFeatures();
  if (!groups) return null;
  return [...groups.entries()]
    .map(([code, features]) => toSummary(code, representative(features)))
    .sort((a, b) => a.code.localeCompare(b.code, 'tr'));
}

export async function getIettRoute(id: string): Promise<TransitRoute | null> {
  const code = id.replace(/^iett:/, '');
  const groups = await groupedFeatures();
  const features = groups?.get(code);
  if (!features) return null;
  const chosen = representative(features);
  return {
    ...toSummary(code, chosen),
    coordinates: chosen.geometry.coordinates,
    stops: [],
    vehicles: [],
  };
}
