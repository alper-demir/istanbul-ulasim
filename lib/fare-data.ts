import fareCatalog from '@/data/fares/istanbulkart-2026-07-20.json';

export type FareVerification = 'route-verified' | 'group-verified' | 'general-only';
export type FareKind = 'fixed' | 'distance-bands' | 'distance-based';
export type FarePrices = Partial<Record<'full' | 'student' | 'discounted' | 'student30Plus', number>>;

export type FareBand = {
  label: string;
  pricesKurus: FarePrices;
  subscriptionLimit?: number;
  limitedUseTicketCount?: number;
};

export type FareProfile = {
  id: string;
  kind: FareKind;
  label: string;
  shortLabel: string;
  sourceId: string;
  pricesKurus?: FarePrices;
  subscriptionLimit?: number;
  limitedUseTicketCount?: number;
  notes?: string[];
  bands?: FareBand[];
};

type RouteProfile = {
  profileId: string;
  verification: FareVerification;
  sourceId: string;
  note?: string;
};

type FareCatalog = {
  schemaVersion: number;
  id: string;
  title: string;
  currency: string;
  effectiveFrom: string;
  verifiedAt: string;
  sources: Array<{ id: string; label: string; url: string; decision?: string; effectiveFrom?: string; purpose?: string }>;
  profiles: FareProfile[];
  routeProfiles: Record<string, RouteProfile>;
  fallbackProfiles: Record<string, RouteProfile>;
};

export const istanbulFareCatalog = fareCatalog as FareCatalog;

const profileById = new Map(istanbulFareCatalog.profiles.map((profile) => [profile.id, profile]));
const sourceById = new Map(istanbulFareCatalog.sources.map((source) => [source.id, source]));

export type ResolvedFare = FareProfile & {
  verification: FareVerification;
  sourceUrl: string;
  sourceLabel: string;
  effectiveFrom: string;
  verifiedAt: string;
  resolutionNote?: string;
};

export function resolveFare(routeId: string): ResolvedFare | null {
  const network = routeId.split(':', 1)[0];
  const mapping = istanbulFareCatalog.routeProfiles[routeId] ?? istanbulFareCatalog.fallbackProfiles[network];
  if (!mapping) return null;
  const profile = profileById.get(mapping.profileId);
  const source = sourceById.get(mapping.sourceId);
  if (!profile || !source) return null;
  return {
    ...profile,
    verification: mapping.verification,
    sourceUrl: source.url,
    sourceLabel: source.label,
    effectiveFrom: istanbulFareCatalog.effectiveFrom,
    verifiedAt: istanbulFareCatalog.verifiedAt,
    resolutionNote: mapping.note,
  };
}

export function fareLabelForRoute(routeId: string) {
  return resolveFare(routeId)?.shortLabel ?? 'Tarife bilgisi bulunamadı';
}
