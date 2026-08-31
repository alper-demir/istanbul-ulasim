import fareCatalog from '@/data/fares/istanbulkart-2026-07-20.json';
import iettTariffRules from '@/data/fares/iett-route-tariff-rules.json';
import iettTariffSnapshot from '@/data/fares/snapshots/iett-route-tariffs.json';

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
  limitedUseTickets?: Array<{ label: string; priceKurus: number; passCount: number }>;
  sources: Array<{ id: string; label: string; url: string; decision?: string; effectiveFrom?: string; purpose?: string }>;
  profiles: FareProfile[];
  routeProfiles: Record<string, RouteProfile>;
  fallbackProfiles: Record<string, RouteProfile>;
};

export const istanbulFareCatalog = fareCatalog as FareCatalog;

const profileById = new Map(istanbulFareCatalog.profiles.map((profile) => [profile.id, profile]));
const sourceById = new Map(istanbulFareCatalog.sources.map((source) => [source.id, source]));
const iettSnapshotByRoute = new Map(iettTariffSnapshot.routes.map((route) => [route.routeId, route]));

function iettRouteMapping(routeId: string): RouteProfile | null {
  const route = iettSnapshotByRoute.get(routeId);
  if (!route?.tariff) return null;
  const profileId = iettTariffRules.routeOverrides[routeId as keyof typeof iettTariffRules.routeOverrides]
    ?? iettTariffRules.tariffProfiles[route.tariff as keyof typeof iettTariffRules.tariffProfiles];
  return profileId ? {
    profileId,
    verification: 'route-verified',
    sourceId: 'iett-route-tariff-snapshot',
    note: `İETT hat detayında “${route.tariff}” olarak doğrulandı.`,
  } : null;
}

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
  const mapping = istanbulFareCatalog.routeProfiles[routeId]
    ?? (network === 'iett' ? iettRouteMapping(routeId) : null)
    ?? istanbulFareCatalog.fallbackProfiles[network];
  if (!mapping) return null;
  const profile = profileById.get(mapping.profileId);
  const source = sourceById.get(mapping.sourceId);
  if (!profile || !source) return null;
  return {
    ...profile,
    verification: mapping.verification,
    sourceUrl: source.url.replace('{hatKodu}', routeId.split(':', 2)[1] ?? ''),
    sourceLabel: source.label,
    effectiveFrom: istanbulFareCatalog.effectiveFrom,
    verifiedAt: istanbulFareCatalog.verifiedAt,
    resolutionNote: mapping.note,
  };
}

export function fareLabelForRoute(routeId: string) {
  return resolveFare(routeId)?.shortLabel ?? 'Tarife bilgisi bulunamadı';
}
