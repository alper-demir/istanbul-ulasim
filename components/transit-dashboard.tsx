'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { FeatureCollection } from 'geojson';
import { useTheme } from 'next-themes';
import {
  AlertTriangle, BusFront, Check, ChevronDown, ChevronRight, Clock3, LocateFixed, MapPin, Moon,
  Info, Navigation2, Route as RouteIcon, Search, Share2, Star, Sun, Ticket, TramFront, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScheduleDialog } from '@/components/schedule-panel';
import { routes as fixtureRoutes, type TransitDirection, type TransitRoute, type TransitStop, type TransitVehicle } from '@/lib/transit-fixtures';
import type { TransitRouteSummary } from '@/lib/data-sources/iett-route-store';
import type { IettLiveVehicle } from '@/lib/data-sources/iett-live-vehicles';
import { parseScheduleManifestPayload, parseSchedulePayload, type ScheduleManifestPayload, type SchedulePayload } from '@/lib/schedule-data';
import type { TransitStopOccurrence, TransitStopSummary } from '@/lib/transit-search';
import { normalizeTransitSearch, rankRouteMatches, rankStopMatches } from '@/lib/transit-discovery';
import { safeInterpolatedCoordinate } from '@/lib/live-vehicle-motion';
import { APP_VERSION } from '@/lib/app-version';
import { type RecentTransitItem, type SavedManualLocation, USER_STATE_KEYS } from '@/lib/transit-user-state';
import { cn } from '@/lib/utils';
import { useDialogFocus } from '@/lib/dialog-focus';

const ROUTE_SOURCE = 'selected-route';
const STOP_SOURCE = 'selected-stops';
const VEHICLE_SOURCE = 'selected-vehicles';
const USER_LOCATION_SOURCE = 'user-location';
const ENDPOINT_SOURCE = 'route-endpoints';
const COMPARISON_SOURCE = 'comparison-routes';
const VEHICLE_ICON = 'live-vehicle-bus';
const TRANSIT_DATA_VERSION = '2026-08-31.3';
const ROUTE_DATA_UPDATED_LABEL = '26 Ağu 2026';
const STOP_RADIUS: ExpressionSpecification = ['case', ['get', 'selected'], 12, 7];
// MapLibre is substantial. Load it only after the lightweight application shell,
// route index, and selected route are ready to keep the first interaction fast.
const maplibrePromise = import('maplibre-gl');

type LocationStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'unavailable';
type RouteModeFilter = 'all' | 'road' | 'rail' | 'ferry';
type ComparisonRoute = { routeId:string; directionId:string };
type ApproachingVehicle = { vehicle:TransitVehicle; remainingMeters:number; nearSelectedStop:boolean };
type LiveVehicleResponse = {
  data:IettLiveVehicle[];
  meta:{ source:'ibb-iett-live'; status:'live' | 'stale' | 'pending'; cacheStatus:'hit' | 'miss' | 'stale'; cacheTtlMs:number; fetchedAt:string; newestPositionAt:string | null };
};
type Announcement = { id:string; title:string; description:string; routeCodes:string[]; status:'active'|'upcoming'|'expired'|'unknown'; publishedAt:string|null; effectiveTo:string|null; sourceUrl:string };
type FarePriceKey = 'full' | 'student' | 'discounted' | 'student30Plus';
type FareCatalogProfile = {
  id:string;
  kind:'fixed' | 'distance-bands' | 'distance-based';
  label:string;
  shortLabel:string;
  sourceId:string;
  pricesKurus?:Partial<Record<FarePriceKey,number>>;
  subscriptionLimit?:number;
  limitedUseTicketCount?:number;
  notes?:string[];
  bands?:Array<{ label:string; pricesKurus:Partial<Record<FarePriceKey,number>>; subscriptionLimit?:number; limitedUseTicketCount?:number }>;
};
type FareCatalog = {
  effectiveFrom:string;
  verifiedAt:string;
  sources:Array<{ id:string; label:string; url:string }>;
  limitedUseTickets?:Array<{ label:string; priceKurus:number; passCount:number }>;
  monthlyPasses?:Array<{ label:string; priceKurus:number; passCount:number }>;
  profiles:FareCatalogProfile[];
  routeProfiles:Record<string,{ profileId:string; verification:'route-verified' | 'group-verified' | 'general-only'; sourceId:string; note?:string }>;
  fallbackProfiles:Record<string,{ profileId:string; verification:'route-verified' | 'group-verified' | 'general-only'; sourceId:string; note?:string }>;
};
type ResolvedFare = FareCatalogProfile & { verification:'route-verified' | 'group-verified' | 'general-only'; source:{ label:string; url:string }; effectiveFrom:string; verifiedAt:string; note?:string };

const PRICE_CATEGORY_HELP: Partial<Record<FarePriceKey,string>> = {
  discounted: 'Resmî tarifedeki “İndirimli 2” kart grubu. Hak sahipliği ve kullanım koşulları İstanbulkart kurallarına bağlıdır.',
  student30Plus: '30 yaşından gün almış öğrenciler için resmî tarifedeki ayrı öğrenci fiyatı.',
};
const PRICE_CATEGORY_LABEL: Record<FarePriceKey,string> = { full:'Tam', student:'Öğrenci', discounted:'İndirimli', student30Plus:'30+ öğrenci' };

function readRouteStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const route = params.get('route')?.trim();
  return {
    routeId: route ? (route.includes(':') ? route : `iett:${route}`) : 'iett:500T',
    directionId: params.get('direction')?.trim() || 'outbound',
    stopId: params.get('stop')?.trim() || null,
  };
}

function staticRouteUrl(routeId: string) {
  if (routeId.startsWith('iett:')) return `/iett/routes/${encodeURIComponent(routeId.replace('iett:', ''))}.json`;
  if (routeId.startsWith('metro:')) return `/metro/routes/${encodeURIComponent(routeId.replace('metro:', ''))}.json`;
  if (routeId.startsWith('rail:')) return `/rail/routes/${encodeURIComponent(routeId.replace('rail:', ''))}.json`;
  if (routeId.startsWith('ferry:')) return `/ferry/routes/${encodeURIComponent(routeId.replace('ferry:', ''))}.json`;
  return null;
}

function routeMatchesFilter(route: TransitRouteSummary, filter: RouteModeFilter) {
  if (filter === 'all') return true;
  if (filter === 'road') return route.mode === 'Otobüs' || route.mode === 'Metrobüs';
  if (filter === 'rail') return ['Metro', 'Tramvay', 'Füniküler', 'Marmaray'].includes(route.mode);
  return route.mode === 'Vapur';
}

function stopKind(mode: TransitRoute['mode']) {
  if (mode === 'Vapur') return 'iskele';
  if (['Metro', 'Tramvay', 'Füniküler', 'Marmaray'].includes(mode)) return 'istasyon';
  return 'durak';
}

function stopKindPlural(mode: TransitRoute['mode']) {
  if (mode === 'Vapur') return 'iskeleleri';
  if (['Metro', 'Tramvay', 'Füniküler', 'Marmaray'].includes(mode)) return 'istasyonları';
  return 'durakları';
}

async function readStaticJson<T>(path: string): Promise<T | null> {
  const response = await fetch(path);
  return response.ok ? response.json() as Promise<T> : null;
}

// Keep the operational layers independent of the basemap provider.  If tile
// delivery is slow, the background remains legible and the transit data stays
// usable instead of presenting a blank map surface.
const ISTANBUL_BASEMAP_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    { id: 'basemap-background', type: 'background' as const, paint: { 'background-color': '#dce8e6' } },
    { id: 'osm-raster', type: 'raster' as const, source: 'osm', paint: { 'raster-saturation': -0.35, 'raster-contrast': -0.08 } },
  ],
};

function lineFeature(route: TransitRoute): FeatureCollection {
  return { type:'FeatureCollection', features:[{ type:'Feature', properties:{ color:route.color }, geometry:{ type:'LineString', coordinates:route.coordinates } }] };
}

function endpointFeatures(route: TransitRoute): FeatureCollection {
  const start = route.stops[0]?.coordinates ?? route.coordinates[0]!;
  const end = route.stops.at(-1)?.coordinates ?? route.coordinates.at(-1)!;
  return { type:'FeatureCollection', features:[
    { type:'Feature', properties:{ kind:'start', label:'BAŞLANGIÇ' }, geometry:{ type:'Point', coordinates:start } },
    { type:'Feature', properties:{ kind:'end', label:'BİTİŞ' }, geometry:{ type:'Point', coordinates:end } },
  ] };
}

function comparisonFeatures(routes: TransitRoute[]): FeatureCollection {
  return { type:'FeatureCollection', features:routes.map((route) => ({ type:'Feature', properties:{ color:route.color }, geometry:{ type:'LineString', coordinates:route.coordinates } })) };
}

function stopFeatures(route: TransitRoute, selectedStopId?: string): FeatureCollection {
  return { type:'FeatureCollection', features:route.stops.map((stop,index) => ({ type:'Feature', properties:{ ...stop, order:index+1, selected:stop.id === selectedStopId }, geometry:{ type:'Point', coordinates:stop.coordinates } })) };
}

function vehicleFeatures(vehicles: TransitVehicle[], selectedVehicleId?: string): FeatureCollection {
  return { type:'FeatureCollection', features:vehicles.map((vehicle) => ({ type:'Feature', properties:{ ...vehicle, stale:vehicle.updatedSecondsAgo > 180, selected:vehicle.id === selectedVehicleId }, geometry:{ type:'Point', coordinates:vehicle.coordinates } })) };
}

function vehicleIconImage() {
  const canvas = document.createElement('canvas');
  canvas.width = 36;
  canvas.height = 36;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Araç simgesi oluşturulamadı');
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.roundRect(8, 4, 20, 25, 5);
  context.fill();
  context.fillStyle = '#334155';
  context.beginPath();
  context.roundRect(11, 8, 14, 8, 2);
  context.fill();
  context.fillRect(11, 19, 14, 3);
  context.beginPath();
  context.arc(12, 29, 3, 0, Math.PI * 2);
  context.arc(24, 29, 3, 0, Math.PI * 2);
  context.fill();
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function vehicleDirectionName(vehicle: TransitVehicle, directions?: TransitDirection[]) {
  const direction = directions?.find((item) => item.id === vehicle.directionId);
  if (direction) return direction.name;
  if (vehicle.direction && vehicle.direction !== 'Yön bilgisi yok') return `→ ${vehicle.direction}`;
  return 'Yön bilgisi bulunamadı';
}

function vehicleFreshnessLabel(updatedSecondsAgo: number) {
  if (updatedSecondsAgo <= 60) return 'CANLI';
  if (updatedSecondsAgo <= 180) return 'GÜNCELLENİYOR';
  return 'ESKİ VERİ';
}

function vehicleAgeLabel(updatedSecondsAgo: number) {
  if (updatedSecondsAgo < 60) return `${updatedSecondsAgo} sn önce`;
  const minutes = Math.floor(updatedSecondsAgo / 60);
  const seconds = updatedSecondsAgo % 60;
  return seconds ? `${minutes} dk ${seconds} sn önce` : `${minutes} dk önce`;
}

function vehicleFreshnessClass(updatedSecondsAgo: number) {
  if (updatedSecondsAgo <= 60) return 'text-emerald-600 dark:text-emerald-300';
  if (updatedSecondsAgo <= 180) return 'text-amber-600 dark:text-amber-300';
  return 'text-orange-700 dark:text-orange-300';
}

function vehicleFreshnessDescription(updatedSecondsAgo: number) {
  if (updatedSecondsAgo <= 60) return 'CANLI: İETT kaydı son 1 dakika içinde güncellendi.';
  if (updatedSecondsAgo <= 180) return 'GÜNCELLENİYOR: İETT kaydı 1–3 dakika önce alındı; konum kısa süre içinde yenilenebilir.';
  return 'ESKİ VERİ: İETT kaydı 3 dakikadan daha eski; araç konumu güncel olmayabilir.';
}

function vehicleBadgeClass(updatedSecondsAgo: number) {
  if (updatedSecondsAgo <= 60) return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300';
  if (updatedSecondsAgo <= 180) return 'bg-amber-500/10 text-amber-600 dark:text-amber-300';
  return 'bg-orange-500/10 text-orange-700 dark:text-orange-300';
}

function formatSourceTimestamp(value?: string | null) {
  if (!value) return null;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return null;
  return new Intl.DateTimeFormat('tr-TR', {
    day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'Europe/Istanbul',
  }).format(timestamp);
}

function formatSourceDate(value?: string | null) {
  if (!value) return null;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return null;
  return new Intl.DateTimeFormat('tr-TR', {
    day:'numeric', month:'short', year:'numeric', timeZone:'Europe/Istanbul',
  }).format(timestamp);
}

function scrollPanelToSection(id: string) {
  const target = document.getElementById(id);
  const panel = target?.closest('aside');
  if (!target || !panel) return;
  const targetRect = target.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  panel.scrollTo({ top: panel.scrollTop + targetRect.top - panelRect.top - 140, behavior:'smooth' });
}

function formatFare(value?: number) {
  if (value === undefined) return '—';
  return new Intl.NumberFormat('tr-TR', {
    style:'currency', currency:'TRY', minimumFractionDigits:2, maximumFractionDigits:2,
  }).format(value / 100);
}

function resolveCatalogFare(catalog: FareCatalog | undefined, routeId: string): ResolvedFare | null {
  if (!catalog) return null;
  const network = routeId.split(':', 1)[0];
  const mapping = catalog.routeProfiles[routeId] ?? catalog.fallbackProfiles[network];
  const profile = mapping && catalog.profiles.find((item) => item.id === mapping.profileId);
  const source = mapping && catalog.sources.find((item) => item.id === mapping.sourceId);
  return mapping && profile && source
    ? { ...profile, verification:mapping.verification, source:{ ...source, url:source.url.replace('{hatKodu}', routeId.split(':', 2)[1] ?? '') }, effectiveFrom:catalog.effectiveFrom, verifiedAt:catalog.verifiedAt, note:mapping.note }
    : null;
}

function fareVerificationLabel(verification: ResolvedFare['verification']) {
  if (verification === 'route-verified') return 'Hat bazında doğrulandı';
  if (verification === 'group-verified') return 'Tarife grubu doğrulandı';
  return 'Genel tarife';
}

function userLocationFeature(location?: [number, number]): FeatureCollection {
  return { type:'FeatureCollection', features:location ? [{ type:'Feature', properties:{}, geometry:{ type:'Point', coordinates:location } }] : [] };
}

function distanceInMeters(from: [number, number], to: [number, number]) {
  const earthRadius = 6_371_000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = toRadians(to[1] - from[1]);
  const longitudeDelta = toRadians(to[0] - from[0]);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(from[1])) * Math.cos(toRadians(to[1])) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(distance: number) {
  return distance < 1_000 ? `${Math.round(distance)} m` : `${(distance / 1_000).toFixed(1).replace('.', ',')} km`;
}

function projectPointOnRoute(point: [number, number], route: [number, number][]) {
  if (route.length < 2) return null;
  const longitudeScale = 111_320 * Math.cos(point[1] * Math.PI / 180);
  const latitudeScale = 110_540;
  let closestDistance = Number.POSITIVE_INFINITY;
  let closestProgress = 0;
  let cumulativeDistance = 0;

  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index]!;
    const end = route[index + 1]!;
    const startX = (start[0] - point[0]) * longitudeScale;
    const startY = (start[1] - point[1]) * latitudeScale;
    const segmentX = (end[0] - start[0]) * longitudeScale;
    const segmentY = (end[1] - start[1]) * latitudeScale;
    const segmentSquared = segmentX ** 2 + segmentY ** 2;
    const projection = segmentSquared ? Math.max(0, Math.min(1, -(startX * segmentX + startY * segmentY) / segmentSquared)) : 0;
    const distance = Math.hypot(startX + segmentX * projection, startY + segmentY * projection);
    const segmentDistance = distanceInMeters(start, end);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestProgress = cumulativeDistance + segmentDistance * projection;
    }
    cumulativeDistance += segmentDistance;
  }

  return { progressMeters:closestProgress, distanceToRouteMeters:closestDistance };
}

function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reducedMotion;
}

function usePageVisibility() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const update = () => setIsVisible(document.visibilityState === 'visible');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  return isVisible;
}

type VehicleMotionFrame = {
  vehicle:TransitVehicle;
  from:[number, number];
  to:[number, number] | null;
};

function useSmoothedVehicleMarkers({
  vehicles,
  route,
  routeKey,
  snapshotKey,
  isLive,
}: {
  vehicles:TransitVehicle[];
  route:[number, number][];
  routeKey:string;
  snapshotKey:string | undefined;
  isLive:boolean;
}) {
  const reducedMotion = useReducedMotionPreference();
  const isPageVisible = usePageVisibility();
  const [displayVehicles, setDisplayVehicles] = useState<TransitVehicle[]>(vehicles);
  const displayVehiclesRef = useRef<TransitVehicle[]>(vehicles);
  const priorSnapshotRef = useRef<{ routeKey:string; snapshotKey:string | undefined } | null>(null);

  useEffect(() => {
    const previousSnapshot = priorSnapshotRef.current;
    priorSnapshotRef.current = { routeKey, snapshotKey };
    const previousById = new Map(displayVehiclesRef.current.map((vehicle) => [vehicle.id, vehicle]));
    const canAnimate = Boolean(
      isLive
      && isPageVisible
      && !reducedMotion
      && previousSnapshot?.routeKey === routeKey
      && previousSnapshot.snapshotKey
      && previousSnapshot.snapshotKey !== snapshotKey,
    );
    const frames: VehicleMotionFrame[] = vehicles.map((vehicle) => {
      const previous = previousById.get(vehicle.id);
      if (!canAnimate || !previous) return { vehicle, from:vehicle.coordinates, to:null };
      const from = safeInterpolatedCoordinate({
        from:previous.coordinates,
        to:vehicle.coordinates,
        route,
        fromUpdatedSecondsAgo:previous.updatedSecondsAgo,
        toUpdatedSecondsAgo:vehicle.updatedSecondsAgo,
        progress:0,
      });
      const to = safeInterpolatedCoordinate({
        from:previous.coordinates,
        to:vehicle.coordinates,
        route,
        fromUpdatedSecondsAgo:previous.updatedSecondsAgo,
        toUpdatedSecondsAgo:vehicle.updatedSecondsAgo,
        progress:1,
      });
      return from && to ? { vehicle, from, to } : { vehicle, from:vehicle.coordinates, to:null };
    });
    const hasMotion = frames.some((frame) => frame.to);
    const publish = (progress:number) => {
      const next = frames.map(({ vehicle, from, to }) => ({ ...vehicle, coordinates:to ? [
        from[0] + (to[0] - from[0]) * progress,
        from[1] + (to[1] - from[1]) * progress,
      ] as [number, number] : from }));
      displayVehiclesRef.current = next;
      setDisplayVehicles(next);
    };

    if (!hasMotion) {
      publish(1);
      return;
    }

    const startedAt = performance.now();
    const durationMs = 20_000;
    let animationFrame = 0;
    const animate = (now:number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      publish(progress);
      if (progress < 1) animationFrame = window.requestAnimationFrame(animate);
    };
    publish(0);
    animationFrame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [isLive, isPageVisible, reducedMotion, route, routeKey, snapshotKey, vehicles]);

  return displayVehicles;
}

function approachingVehicleLabel(item: ApproachingVehicle) {
  if (item.nearSelectedStop || item.remainingMeters <= 250) return 'Durağa çok yakın';
  return `Güzergâhta yaklaşık ${formatDistance(item.remainingMeters)} geride`;
}

function occurrenceDirectionName(route: TransitRouteSummary, directionId: string) {
  const terminals = route.name.split(/\s+—\s+/).map((terminal) => terminal.trim()).filter(Boolean);
  if (terminals.length < 2) return 'Yön bilgisi';
  const first = terminals[0]!;
  const last = terminals.at(-1)!;
  return directionId === 'return' ? `${last} → ${first}` : `${first} → ${last}`;
}

function readStoredStringList(key: string) {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : [];
  } catch { return []; }
}

function readStoredRecents() {
  if (typeof window === 'undefined') return [] as RecentTransitItem[];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(USER_STATE_KEYS.recents) ?? '[]');
    return Array.isArray(parsed) && parsed.every((item) => item && typeof item === 'object' && (item.kind === 'route' || item.kind === 'stop')) ? parsed.slice(0, 6) as RecentTransitItem[] : [];
  } catch { return []; }
}

function readStoredManualLocation(): SavedManualLocation | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(USER_STATE_KEYS.manualLocation) ?? 'null') as SavedManualLocation | null;
    return parsed && Array.isArray(parsed.coordinates) && parsed.coordinates.length === 2 && parsed.coordinates.every(Number.isFinite) ? parsed : null;
  } catch { return null; }
}

function fitRoute(map: MapLibreMap, route: TransitRoute) {
  const firstCoordinate = route.coordinates[0]!;
  const bounds: [[number, number], [number, number]] = [
    [...firstCoordinate],
    [...firstCoordinate],
  ];
  for (const [longitude, latitude] of route.coordinates) {
    bounds[0][0] = Math.min(bounds[0][0], longitude);
    bounds[0][1] = Math.min(bounds[0][1], latitude);
    bounds[1][0] = Math.max(bounds[1][0], longitude);
    bounds[1][1] = Math.max(bounds[1][1], latitude);
  }
  const compact = window.innerWidth < 768;
  map.fitBounds(bounds, {
    padding: compact ? { top:100, right:35, bottom:210, left:35 } : { top:120, right:400, bottom:90, left:360 },
    maxZoom:11.8,
    duration:900,
  });
}

export function TransitDashboard() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedRouteRef = useRef(fixtureRoutes[0]);
  const manualLocationModeRef = useRef(false);
  const [selectedRouteId, setSelectedRouteId] = useState('iett:500T');
  const [selectedDirectionId, setSelectedDirectionId] = useState('outbound');
  const [selectedVehicle, setSelectedVehicle] = useState<TransitVehicle | null>(null);
  const [selectedStop, setSelectedStop] = useState<TransitStop | null>(null);
  const [pendingStop, setPendingStop] = useState<{ stopId:string; routeId:string; directionId:string } | null>(null);
  const [search, setSearch] = useState('');
  const [routeModeFilter, setRouteModeFilter] = useState<RouteModeFilter>('all');
  const [routeListOpen, setRouteListOpen] = useState(true);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(() => readStoredManualLocation()?.coordinates ?? null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [manualLocationMode, setManualLocationMode] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => readStoredStringList(USER_STATE_KEYS.favoriteRoutes));
  const [favoriteStopIds, setFavoriteStopIds] = useState<string[]>(() => readStoredStringList(USER_STATE_KEYS.favoriteStops));
  const [recents, setRecents] = useState<RecentTransitItem[]>(readStoredRecents);
  const [savedManualLocation, setSavedManualLocation] = useState<SavedManualLocation | null>(readStoredManualLocation);
  const [locationOrigin, setLocationOrigin] = useState<'browser' | 'manual' | null>(() => readStoredManualLocation() ? 'manual' : null);
  const [comparisonRouteKeys, setComparisonRouteKeys] = useState<ComparisonRoute[]>([]);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [fareCatalogOpen, setFareCatalogOpen] = useState(false);
  const [urlStateReady, setUrlStateReady] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [fareDetailsOpen, setFareDetailsOpen] = useState(false);
  const [scheduleDetailsOpen, setScheduleDetailsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const { resolvedTheme, setTheme } = useTheme();
  const aboutDialogRef = useDialogFocus<HTMLElement>(() => setAboutOpen(false), aboutOpen);

  useEffect(() => {
    if (!aboutOpen && !fareCatalogOpen && !fareDetailsOpen && !scheduleDetailsOpen && !manualLocationMode) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (scheduleDetailsOpen) setScheduleDetailsOpen(false);
      else if (fareCatalogOpen) setFareCatalogOpen(false);
      else if (fareDetailsOpen) setFareDetailsOpen(false);
      else if (aboutOpen) setAboutOpen(false);
      else if (manualLocationMode) {
        manualLocationModeRef.current = false;
        setManualLocationMode(false);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [aboutOpen, fareCatalogOpen, fareDetailsOpen, manualLocationMode, scheduleDetailsOpen]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const routesQuery = useQuery({
    queryKey: ['routes', TRANSIT_DATA_VERSION],
    queryFn: async (): Promise<{ data: TransitRouteSummary[]; meta?:{ source?:string; routeCount?:number } }> => {
      const [iett, metro, rail, ferry] = await Promise.all([
        readStaticJson<{ data: TransitRouteSummary[]; meta?:{ source?:string; routeCount?:number } }>(`/iett/route-index.json?v=${TRANSIT_DATA_VERSION}`),
        readStaticJson<{ data: TransitRouteSummary[]; meta?:{ source?:string; routeCount?:number } }>(`/metro/route-index.json?v=${TRANSIT_DATA_VERSION}`),
        readStaticJson<{ data: TransitRouteSummary[]; meta?:{ source?:string; routeCount?:number } }>(`/rail/route-index.json?v=${TRANSIT_DATA_VERSION}`),
        readStaticJson<{ data: TransitRouteSummary[]; meta?:{ source?:string; routeCount?:number } }>(`/ferry/route-index.json?v=${TRANSIT_DATA_VERSION}`),
      ]);
      const data = [...(iett?.data ?? []), ...(metro?.data ?? []), ...(rail?.data ?? []), ...(ferry?.data ?? [])];
      if (!data.length) throw new Error('Hat verisi alınamadı');
      return { data, meta: { source: 'static-networks', routeCount: data.length } };
    },
    placeholderData: { data: fixtureRoutes.map(({ stops, vehicles, ...route }) => ({ ...route, vehicleCount: vehicles.length, stopCount: stops.length })) },
    staleTime: 24 * 60 * 60 * 1000,
  });

  const routes = routesQuery.data?.data ?? fixtureRoutes.map(({ stops, vehicles, ...route }) => ({ ...route, vehicleCount: vehicles.length, stopCount: stops.length }));
  const normalizedSearch = normalizeTransitSearch(search.trim());
  const stopIndexQuery = useQuery({
    queryKey: ['stops', TRANSIT_DATA_VERSION],
    queryFn: async (): Promise<{ data: TransitStopSummary[]; meta?:{ source?:string; stopCount?:number } }> => {
      const [iett, metro, rail, ferry] = await Promise.all([
        readStaticJson<{ data: TransitStopSummary[]; meta?:{ source?:string; stopCount?:number } }>(`/iett/stop-index.json?v=${TRANSIT_DATA_VERSION}`),
        readStaticJson<{ data: TransitStopSummary[]; meta?:{ source?:string; stopCount?:number } }>(`/metro/stop-index.json?v=${TRANSIT_DATA_VERSION}`),
        readStaticJson<{ data: TransitStopSummary[]; meta?:{ source?:string; stopCount?:number } }>(`/rail/stop-index.json?v=${TRANSIT_DATA_VERSION}`),
        readStaticJson<{ data: TransitStopSummary[]; meta?:{ source?:string; stopCount?:number } }>(`/ferry/stop-index.json?v=${TRANSIT_DATA_VERSION}`),
      ]);
      const data = [...(iett?.data ?? []), ...(metro?.data ?? []), ...(rail?.data ?? []), ...(ferry?.data ?? [])];
      if (!data.length) throw new Error('Durak verisi alınamadı');
      return { data, meta: { source: 'static-networks', stopCount: data.length } };
    },
    enabled: normalizedSearch.length >= 2 || Boolean(selectedStop) || Boolean(userLocation) || favoriteStopIds.length > 0,
    staleTime: 24 * 60 * 60 * 1000,
  });
  const routeQuery = useQuery({
    queryKey: ['route', TRANSIT_DATA_VERSION, selectedRouteId],
    queryFn: async (): Promise<{ data: TransitRoute }> => {
      const staticUrl = staticRouteUrl(selectedRouteId);
      const response = staticUrl
        ? await fetch(`${staticUrl}?v=${TRANSIT_DATA_VERSION}`)
        : await fetch(`/api/v1/routes/${encodeURIComponent(selectedRouteId)}`);
      if (!response.ok) throw new Error('Hat detayı alınamadı');
      return response.json();
    },
    placeholderData: (previousData) => previousData,
    staleTime: 24 * 60 * 60 * 1000,
  });
  const fareCatalogQuery = useQuery({
    queryKey:['fare-catalog', TRANSIT_DATA_VERSION],
    queryFn: async (): Promise<{ data:FareCatalog }> => {
      const response = await fetch(`/fares/current.json?v=${TRANSIT_DATA_VERSION}`);
      if (!response.ok) throw new Error('Tarife verisi alınamadı');
      return response.json();
    },
    staleTime:24 * 60 * 60 * 1000,
  });
  const scheduleManifestQuery = useQuery({
    queryKey:['schedule-manifest', TRANSIT_DATA_VERSION],
    queryFn: async (): Promise<ScheduleManifestPayload> => {
      const response = await fetch(`/schedules/manifest.json?v=${TRANSIT_DATA_VERSION}`);
      if (!response.ok) throw new Error('Sefer manifesti alınamadı');
      return parseScheduleManifestPayload(await response.json());
    },
    enabled:scheduleDetailsOpen,
    staleTime:24 * 60 * 60 * 1000,
    retry:1,
  });
  const schedulePath = scheduleManifestQuery.data?.data.routes[selectedRouteId]?.path;
  const scheduleQuery = useQuery({
    queryKey:['schedule', TRANSIT_DATA_VERSION, selectedRouteId, schedulePath],
    queryFn: async (): Promise<SchedulePayload> => {
      if (!schedulePath) throw new Error('Hat için sefer dosyası bulunamadı');
      const response = await fetch(`${schedulePath}?v=${TRANSIT_DATA_VERSION}`);
      if (!response.ok) throw new Error('Sefer verisi alınamadı');
      const payload = parseSchedulePayload(await response.json());
      if (payload.data.routeId !== selectedRouteId) throw new Error('Sefer verisi yanlış hatla eşleşti');
      return payload;
    },
    enabled:scheduleDetailsOpen && Boolean(schedulePath),
    staleTime:24 * 60 * 60 * 1000,
    retry:1,
  });
  const liveVehiclesQuery = useQuery({
    queryKey:['live-vehicles', selectedRouteId],
    queryFn:async (): Promise<LiveVehicleResponse> => {
      const routeCode = selectedRouteId.replace(/^iett:/, '');
      const response = await fetch(`/api/v1/live-vehicles?route=${encodeURIComponent(routeCode)}`);
      if (!response.ok) throw new Error('Canlı araç verisi alınamadı');
      return response.json();
    },
    enabled:selectedRouteId.startsWith('iett:'),
    staleTime:15_000,
    refetchInterval:30_000,
    refetchIntervalInBackground:false,
    refetchOnWindowFocus:true,
    refetchOnReconnect:true,
    retry:1,
  });
  const announcementsQuery = useQuery({
    queryKey:['announcements', selectedRouteId],
    queryFn:async ():Promise<{ data:Announcement[]; meta:{ status:string; cacheStatus:string; fetchedAt:string } }> => {
      const code = selectedRouteId.replace(/^iett:/, '');
      const response = await fetch(`/api/v1/announcements?route=${encodeURIComponent(code)}`);
      if (!response.ok) throw new Error('Duyurular alınamadı');
      return response.json();
    },
    enabled:selectedRouteId.startsWith('iett:'),
    staleTime:90_000,
    refetchInterval:120_000,
    refetchIntervalInBackground:false,
    retry:1,
  });
  const comparisonQueries = useQueries({
    queries: comparisonRouteKeys.map(({ routeId }) => ({
      queryKey:['comparison-route', TRANSIT_DATA_VERSION, routeId],
      queryFn: async (): Promise<{ data:TransitRoute }> => {
        const staticUrl = staticRouteUrl(routeId);
        const response = staticUrl
          ? await fetch(`${staticUrl}?v=${TRANSIT_DATA_VERSION}`)
          : await fetch(`/api/v1/routes/${encodeURIComponent(routeId)}`);
        if (!response.ok) throw new Error('Karşılaştırma hattı alınamadı');
        return response.json();
      },
      staleTime:24 * 60 * 60 * 1000,
    })),
  });

  const routeData = routeQuery.data?.data ?? fixtureRoutes[0];
  const resolvedFare = useMemo(
    () => resolveCatalogFare(fareCatalogQuery.data?.data, routeData.id),
    [fareCatalogQuery.data?.data, routeData.id],
  );
  const selectedDirection = routeData.directions?.find((direction) => direction.id === selectedDirectionId) ?? routeData.directions?.[0];
  const selectedRoute = useMemo(() => {
    const directionalRoute = selectedDirection ? {
      ...routeData,
      coordinates:selectedDirection.coordinates,
      stops:selectedDirection.stops,
      durationMinutes:selectedDirection.durationMinutes,
    } : routeData;
    if (!directionalRoute.id.startsWith('iett:')) return directionalRoute;

    const stopNames = new Map(directionalRoute.stops.map((stop) => [stop.id.replace(/^iett-stop:/, ''), stop.name]));
    const vehicles = (liveVehiclesQuery.data?.data ?? [])
      .filter((vehicle) => vehicle.directionId === selectedDirectionId || vehicle.directionId === 'unknown')
      .map((vehicle) => ({
        ...vehicle,
        nextStop:stopNames.get(vehicle.nearbyStopCode) ?? vehicle.nextStop,
      }));
    return { ...directionalRoute, vehicles };
  }, [liveVehiclesQuery.data?.data, routeData, selectedDirection, selectedDirectionId]);
  const comparisonRoutes = useMemo(() => comparisonRouteKeys.flatMap((key, index) => {
    if (key.routeId === selectedRoute.id && key.directionId === selectedDirection?.id) return [];
    const route = comparisonQueries[index]?.data?.data;
    const direction = route?.directions?.find((item) => item.id === key.directionId) ?? route?.directions?.[0];
    return route && direction ? [{ ...route, coordinates:direction.coordinates, stops:direction.stops, durationMinutes:direction.durationMinutes }] : [];
  }), [comparisonQueries, comparisonRouteKeys, selectedDirection?.id, selectedRoute.id]);
  const selectedStopIndex = selectedStop ? selectedRoute.stops.findIndex((stop) => stop.id === selectedStop.id) : -1;
  const activeRoute = routeQuery.data?.data;
  const isOfficialRoute = Boolean(staticRouteUrl(selectedRoute.id));
  const hasLiveVehicles = selectedRoute.supportsLiveVehicles ?? selectedRoute.id.startsWith('iett:');
  const liveVehicleStatus = liveVehiclesQuery.data?.meta.status;
  const liveVehiclesLoading = hasLiveVehicles && liveVehiclesQuery.isLoading;
  const liveVehiclesUnavailable = hasLiveVehicles && liveVehiclesQuery.isError;
  const liveCacheStatus = liveVehiclesQuery.data?.meta.cacheStatus;
  const mapVehicles = useSmoothedVehicleMarkers({
    vehicles:selectedRoute.vehicles,
    route:selectedRoute.coordinates,
    routeKey:`${selectedRoute.id}:${selectedDirection?.id ?? 'default'}`,
    snapshotKey:liveVehiclesQuery.data?.meta.fetchedAt,
    isLive:hasLiveVehicles && liveVehiclesQuery.data?.meta.status === 'live',
  });
  const liveRefreshSeconds = Math.max(1, Math.round((liveVehiclesQuery.data?.meta.cacheTtlMs ?? 30_000) / 1_000));
  const liveVehicleStatusLabel = liveVehiclesLoading
    ? 'Canlı konumlar yükleniyor'
    : liveVehiclesUnavailable
      ? 'Canlı kaynak erişilemiyor'
      : liveVehicleStatus === 'stale'
        ? 'Son geçerli konumlar'
        : liveVehicleStatus === 'pending'
          ? 'Canlı konum sırada'
        : selectedRoute.vehicles.length
          ? `${liveRefreshSeconds} sn’de yenilenir`
          : 'Bu yönde aktif araç yok';
  const liveSourceTimestamp = formatSourceTimestamp(liveVehiclesQuery.data?.meta.newestPositionAt);
  const liveSnapshotTimestamp = formatSourceTimestamp(liveVehiclesQuery.data?.meta.fetchedAt);
  const liveSourceUpdatedLabel = liveVehiclesLoading
    ? 'Canlı konum kontrol ediliyor'
    : liveVehiclesUnavailable
      ? 'Canlı konum geçici olarak alınamıyor'
      : liveVehicleStatus === 'pending'
        ? 'Yoğunluk nedeniyle canlı konum isteği sıraya alındı'
      : liveSourceTimestamp
        ? `Son canlı kayıt: ${liveSourceTimestamp}${liveVehicleStatus === 'stale' ? ' · önceki yanıt' : liveCacheStatus === 'hit' ? ' · taze önbellek' : ' · yeni kaynak yanıtı'}${liveSnapshotTimestamp ? ` · yanıt alındı: ${liveSnapshotTimestamp}` : ''}`
        : 'İETT şu an bu hat için canlı konum bildirmiyor';
  const filteredRoutes = useMemo(() => {
    const byMode = routes.filter((route) => routeMatchesFilter(route, routeModeFilter));
    if (!normalizedSearch) return byMode;
    return rankRouteMatches(byMode, normalizedSearch);
  }, [normalizedSearch, routeModeFilter, routes]);
  const filteredStops = useMemo(() => {
    if (normalizedSearch.length < 2) return [];
    return rankStopMatches(stopIndexQuery.data?.data ?? [], normalizedSearch);
  }, [normalizedSearch, stopIndexQuery.data?.data]);
  const nearbyStops = useMemo(() => {
    if (!userLocation) return [];
    return (stopIndexQuery.data?.data ?? [])
      .map((stop) => ({ stop, distance:distanceInMeters(userLocation, stop.coordinates) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 12);
  }, [stopIndexQuery.data?.data, userLocation]);
  const routeByCode = useMemo(() => new Map(routes.flatMap((route) => [[route.id, route], [route.code, route]])), [routes]);
  const stopById = useMemo(() => new Map((stopIndexQuery.data?.data ?? []).map((stop) => [stop.id, stop])), [stopIndexQuery.data?.data]);
  const favoriteStops = useMemo(() => favoriteStopIds.map((id) => stopById.get(id)).filter((stop): stop is TransitStopSummary => Boolean(stop)), [favoriteStopIds, stopById]);
  const selectedStopSummary = selectedStop ? stopById.get(selectedStop.id) : undefined;
  const selectedStopOccurrences = useMemo(() => (selectedStopSummary?.routes ?? [])
    .map((occurrence) => ({ occurrence, route:routeByCode.get(occurrence[0]) }))
    .filter((item): item is { occurrence:TransitStopOccurrence; route:TransitRouteSummary } => Boolean(item.route)),
  [routeByCode, selectedStopSummary]);
  const approachingVehicles = useMemo(() => {
    if (!selectedStop || selectedStopIndex < 0 || selectedRoute.coordinates.length < 2) return [] as ApproachingVehicle[];
    const stopProjection = projectPointOnRoute(selectedStop.coordinates, selectedRoute.coordinates);
    if (!stopProjection || stopProjection.distanceToRouteMeters > 750) return [] as ApproachingVehicle[];
    const selectedStopCode = selectedStop.id.replace(/^iett-stop:/, '');

    return selectedRoute.vehicles.flatMap((vehicle) => {
      const nearSelectedStop = vehicle.nearbyStopCode === selectedStopCode;
      if (vehicle.directionId === 'unknown' && !nearSelectedStop) return [];
      const vehicleProjection = projectPointOnRoute(vehicle.coordinates, selectedRoute.coordinates);
      if (!vehicleProjection || vehicleProjection.distanceToRouteMeters > 1_200) return [];
      const remainingMeters = nearSelectedStop ? 0 : stopProjection.progressMeters - vehicleProjection.progressMeters;
      if (remainingMeters < -200) return [];
      return [{ vehicle, remainingMeters:Math.max(0, remainingMeters), nearSelectedStop }];
    })
      .sort((first, second) => Number(first.vehicle.updatedSecondsAgo > 180) - Number(second.vehicle.updatedSecondsAgo > 180)
        || first.remainingMeters - second.remainingMeters)
      .slice(0, 3);
  }, [selectedRoute.coordinates, selectedRoute.vehicles, selectedStop, selectedStopIndex]);
  const favoriteRoutes = useMemo(() => filteredRoutes.filter((route) => favorites.includes(route.id)), [favorites, filteredRoutes]);
  const regularRoutes = useMemo(
    () => search.trim() ? filteredRoutes : filteredRoutes.filter((route) => !favorites.includes(route.id)),
    [favorites, filteredRoutes, search],
  );

  useEffect(() => {
    const applyUrlState = () => {
      const next = readRouteStateFromUrl();
      setSelectedRouteId(next.routeId);
      setSelectedDirectionId(next.directionId);
      setPendingStop(next.stopId ? { stopId:next.stopId, routeId:next.routeId, directionId:next.directionId } : null);
      setUrlStateReady(true);
    };
    applyUrlState();
    window.addEventListener('popstate', applyUrlState);
    return () => window.removeEventListener('popstate', applyUrlState);
  }, []);

  useEffect(() => {
    if (!urlStateReady) return;
    const url = new URL(window.location.href);
    url.searchParams.set('route', selectedRouteId.replace(/^iett:/, ''));
    url.searchParams.set('direction', selectedDirectionId);
    const stopId = pendingStop?.stopId ?? selectedStop?.id;
    if (stopId) url.searchParams.set('stop', stopId);
    else url.searchParams.delete('stop');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [pendingStop?.stopId, selectedDirectionId, selectedRouteId, selectedStop?.id, urlStateReady]);

  useEffect(() => {
    selectedRouteRef.current = selectedRoute;
  }, [selectedRoute]);

  useEffect(() => {
    manualLocationModeRef.current = manualLocationMode;
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = manualLocationMode ? 'crosshair' : '';
  }, [manualLocationMode]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || !activeRoute) return;
    let cancelled = false;
    const initialRoute = activeRoute;
    void maplibrePromise.then((maplibregl) => {
      if (cancelled || !mapContainerRef.current || mapRef.current) return;
      // The worker and its colocated shared module are emitted as Vite assets
      // (see vite.config.ts), so hosted builds can resolve both modules.
      maplibregl.setWorkerUrl(maplibreWorkerUrl);
      const map = new maplibregl.Map({
      container:mapContainerRef.current,
      style: ISTANBUL_BASEMAP_STYLE,
      center:[29.01,41.035], zoom:9.6, minZoom:8, maxZoom:18,
      attributionControl:false,
    });
      map.addControl(new maplibregl.AttributionControl({ compact:true }), 'bottom-right');
      map.addControl(new maplibregl.NavigationControl({ showCompass:true }), 'bottom-right');
      const initializeTransitLayers = () => {
      if (map.getSource(ROUTE_SOURCE)) return;
      map.addSource(COMPARISON_SOURCE, { type:'geojson', data:comparisonFeatures([]) });
      map.addLayer({ id:'comparison-route-halo', type:'line', source:COMPARISON_SOURCE, paint:{ 'line-color':'#ffffff', 'line-width':7, 'line-opacity':0.65 } });
      map.addLayer({ id:'comparison-route-line', type:'line', source:COMPARISON_SOURCE, paint:{ 'line-color':['get','color'], 'line-width':3.5, 'line-opacity':0.8, 'line-dasharray':[1.5,1.2] } });
      map.addSource(ROUTE_SOURCE, { type:'geojson', data:lineFeature(initialRoute) });
      map.addLayer({ id:'route-halo', type:'line', source:ROUTE_SOURCE, paint:{ 'line-color':'#ffffff', 'line-width':9, 'line-opacity':0.72 } });
      map.addLayer({ id:'route-line', type:'line', source:ROUTE_SOURCE, paint:{ 'line-color':['get','color'], 'line-width':5, 'line-opacity':0.96 } });
      map.addSource(STOP_SOURCE, { type:'geojson', data:stopFeatures(initialRoute) });
      // Drawing every stop while viewing the whole city gives little navigational
      // value and is needlessly expensive on mobile GPUs. The route and endpoints
      // remain visible; individual stops appear once the user zooms into a useful
      // inspection level.
      map.addLayer({ id:'route-stops', type:'circle', source:STOP_SOURCE, minzoom:10.5, paint:{
        'circle-radius':STOP_RADIUS,
        'circle-color':['case',['get','selected'],initialRoute.color,'#ffffff'], 'circle-stroke-color':['case',['get','selected'],'#ffffff',initialRoute.color], 'circle-stroke-width':['case',['get','selected'],4,3.5],
      } });
      map.addSource(ENDPOINT_SOURCE, { type:'geojson', data:endpointFeatures(initialRoute) });
      map.addLayer({ id:'route-endpoint-halo', type:'circle', source:ENDPOINT_SOURCE, paint:{
        'circle-radius':18, 'circle-color':['match',['get','kind'],'start','#16a34a','end','#dc2626','#ffffff'], 'circle-opacity':0.18,
      } });
      map.addLayer({ id:'route-endpoints', type:'circle', source:ENDPOINT_SOURCE, paint:{
        'circle-radius':11, 'circle-color':['match',['get','kind'],'start','#16a34a','end','#dc2626','#ffffff'], 'circle-stroke-color':'#ffffff', 'circle-stroke-width':4,
      } });
      map.addLayer({ id:'route-endpoint-labels', type:'symbol', source:ENDPOINT_SOURCE, layout:{
        'text-field':['get','label'], 'text-size':10, 'text-font':['Open Sans Bold'], 'text-anchor':'top', 'text-offset':[0,1.7], 'text-allow-overlap':true,
      }, paint:{ 'text-color':['match',['get','kind'],'start','#15803d','end','#b91c1c','#334155'], 'text-halo-color':'#ffffff', 'text-halo-width':2 } });
      map.addSource(VEHICLE_SOURCE, { type:'geojson', data:vehicleFeatures(initialRoute.vehicles) });
      map.addImage(VEHICLE_ICON, vehicleIconImage(), { pixelRatio:2 });
      map.addLayer({ id:'selected-vehicle-ring', type:'circle', source:VEHICLE_SOURCE, paint:{ 'circle-radius':['case',['get','selected'],28,0], 'circle-color':initialRoute.color, 'circle-opacity':['case',['get','selected'],0.16,0], 'circle-stroke-color':'#ffffff', 'circle-stroke-width':['case',['get','selected'],3,0] } });
      map.addLayer({ id:'vehicle-glow', type:'circle', source:VEHICLE_SOURCE, paint:{ 'circle-radius':['case',['get','selected'],24,20], 'circle-color':initialRoute.color, 'circle-opacity':['case',['get','selected'],0.35,['case',['get','stale'],0.06,0.2]] } });
      map.addLayer({ id:'route-vehicles', type:'circle', source:VEHICLE_SOURCE, paint:{ 'circle-radius':['case',['get','selected'],16,12], 'circle-color':initialRoute.color, 'circle-opacity':['case',['get','stale'],0.45,1], 'circle-stroke-color':'#ffffff', 'circle-stroke-width':['case',['get','selected'],4,2.5] } });
      map.addLayer({ id:'route-vehicle-icons', type:'symbol', source:VEHICLE_SOURCE, layout:{ 'icon-image':VEHICLE_ICON, 'icon-size':['case',['get','selected'],1.25,1], 'icon-allow-overlap':true, 'icon-ignore-placement':true }, paint:{ 'icon-opacity':['case',['get','stale'],0.5,1] } });
      map.addSource(USER_LOCATION_SOURCE, { type:'geojson', data:userLocationFeature() });
      map.addLayer({ id:'user-location-halo', type:'circle', source:USER_LOCATION_SOURCE, paint:{ 'circle-radius':18, 'circle-color':'#14b8a6', 'circle-opacity':0.2 } });
      map.addLayer({ id:'user-location-dot', type:'circle', source:USER_LOCATION_SOURCE, paint:{ 'circle-radius':7, 'circle-color':'#14b8a6', 'circle-stroke-color':'#ffffff', 'circle-stroke-width':3 } });
      const selectVehicleFromMap = (event: MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.id;
        const activeRoute = selectedRouteRef.current;
        setSelectedStop(null);
        setSelectedVehicle(activeRoute.vehicles.find((item) => item.id === id) ?? null);
      };
      for (const layer of ['route-vehicles','route-vehicle-icons']) {
        map.on('mouseenter',layer,() => { map.getCanvas().style.cursor='pointer'; });
        map.on('mouseleave',layer,() => { map.getCanvas().style.cursor=''; });
        map.on('click',layer,selectVehicleFromMap);
      }
      map.on('mouseenter','route-stops',() => { map.getCanvas().style.cursor='pointer'; });
      map.on('mouseleave','route-stops',() => { map.getCanvas().style.cursor=''; });
      map.on('click','route-stops',(event: MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.id;
        const activeRoute = selectedRouteRef.current;
        setSelectedVehicle(null);
        setSelectedStop(activeRoute.stops.find((item) => item.id === id) ?? null);
      });
      map.on('click', (event) => {
        if (!manualLocationModeRef.current) return;
        setUserLocation([event.lngLat.lng, event.lngLat.lat]);
        setLocationAccuracy(null);
        setLocationOrigin('manual');
        setLocationStatus('ready');
        manualLocationModeRef.current = false;
        setManualLocationMode(false);
        setNearbyOpen(true);
        setRouteListOpen(true);
      });
      setMapReady(true);
      fitRoute(map, initialRoute);
      };
      map.on('load', initializeTransitLayers);
      map.on('style.load', initializeTransitLayers);
      if (map.isStyleLoaded()) initializeTransitLayers();
      mapRef.current = map;
    });
    return () => { cancelled = true; };
  }, [activeRoute]);

  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    // Route data can arrive while MapLibre is recreating its style during a
    // hot reload or a slow basemap response.  Mutating a half-loaded style
    // throws and leaves the canvas blank, so wait until every transit layer is
    // available.
    if (!map || !mapReady || !activeRoute || !map.isStyleLoaded() || !map.getSource(ROUTE_SOURCE) || !map.getSource(STOP_SOURCE)) return;
    const route = selectedRouteRef.current;
    (map.getSource(ROUTE_SOURCE) as GeoJSONSource).setData(lineFeature(route));
    (map.getSource(STOP_SOURCE) as GeoJSONSource).setData(stopFeatures(route));
    if (map.getSource(ENDPOINT_SOURCE)) (map.getSource(ENDPOINT_SOURCE) as GeoJSONSource).setData(endpointFeatures(route));
    if (map.getLayer('route-stops')) {
      map.setLayerZoomRange('route-stops', 10.5, 24);
      map.setLayoutProperty('route-stops','visibility','visible');
      map.setPaintProperty('route-stops','circle-radius',STOP_RADIUS);
      map.setPaintProperty('route-stops','circle-color',['case',['get','selected'],route.color,'#ffffff']);
      map.setPaintProperty('route-stops','circle-stroke-color',['case',['get','selected'],'#ffffff',route.color]);
      map.setPaintProperty('route-stops','circle-stroke-width',['case',['get','selected'],4,3.5]);
      map.moveLayer('route-stops');
    }
    setSelectedVehicle(null);
    setSelectedStop(null);
    fitRoute(map,route);
  }, [activeRoute, mapReady, selectedDirectionId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getSource(VEHICLE_SOURCE)) return;
    (map.getSource(VEHICLE_SOURCE) as GeoJSONSource).setData(vehicleFeatures(mapVehicles, selectedVehicle?.id));
    if (map.getLayer('vehicle-glow')) map.setPaintProperty('vehicle-glow','circle-color',selectedRoute.color);
    if (map.getLayer('route-vehicles')) map.setPaintProperty('route-vehicles','circle-color',selectedRoute.color);
    if (map.getLayer('selected-vehicle-ring')) map.setPaintProperty('selected-vehicle-ring','circle-color',selectedRoute.color);
  }, [mapReady, mapVehicles, selectedRoute.color, selectedVehicle?.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getSource(COMPARISON_SOURCE)) return;
    (map.getSource(COMPARISON_SOURCE) as GeoJSONSource).setData(comparisonFeatures(comparisonRoutes));
  }, [comparisonRoutes, mapReady]);

  useEffect(() => {
    if (!pendingStop || selectedRoute.id !== pendingStop.routeId || selectedDirection?.id !== pendingStop.directionId) return;
    const stop = selectedRoute.stops.find((item) => item.id === pendingStop.stopId);
    if (!stop) return;
    // The target route JSON arrives asynchronously after a stop search result
    // is selected. Resolve the stop only once that route and direction exist.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedStop(stop);
    setPendingStop(null);
  }, [pendingStop, selectedDirection?.id, selectedRoute]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getSource(STOP_SOURCE)) return;
    (map.getSource(STOP_SOURCE) as GeoJSONSource).setData(stopFeatures(selectedRouteRef.current, selectedStop?.id));
  }, [activeRoute, mapReady, selectedDirectionId, selectedStop?.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getSource(USER_LOCATION_SOURCE)) return;
    (map.getSource(USER_LOCATION_SOURCE) as GeoJSONSource).setData(userLocationFeature(userLocation ?? undefined));
    if (userLocation) map.flyTo({ center:userLocation, zoom:Math.max(map.getZoom(), 13), duration:700 });
  }, [mapReady, userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selectedStop) return;
    map.flyTo({ center:selectedStop.coordinates, zoom:Math.max(map.getZoom(), 14), duration:500 });
  }, [mapReady, selectedStop]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selectedVehicle) return;
    map.flyTo({ center:selectedVehicle.coordinates, zoom:Math.max(map.getZoom(), 14.5), duration:550 });
  }, [mapReady, selectedVehicle]);

  const selectRoute = (route: TransitRouteSummary) => {
    setNearbyOpen(false);
    setSelectedDirectionId('outbound');
    setSelectedRouteId(route.id);
    rememberRecent({ kind:'route', id:route.id, title:route.code, subtitle:route.name });
    setMobilePanelOpen(true);
    if (window.innerWidth < 768) setRouteListOpen(false);
  };

  const openStopOnRoute = (stopId: string, occurrence: TransitStopOccurrence) => {
    const [routeKey, directionId] = occurrence;
    const routeId = routeKey.includes(':') ? routeKey : `iett:${routeKey}`;
    setPendingStop({ stopId,routeId,directionId });
    setSelectedDirectionId(directionId);
    setSelectedRouteId(routeId);
    setSelectedVehicle(null);
    setMobilePanelOpen(true);
    setRouteListOpen(false);
    setNearbyOpen(false);
    setSearch('');
    const stop = stopById.get(stopId);
    if (stop) rememberRecent({ kind:'stop', id:stop.id, title:stop.name, subtitle:stop.district, routeId, routeCode:routeId.replace(/^[^:]+:/, ''), directionId });
  };

  const selectStopResult = (stop: TransitStopSummary) => {
    const currentCode = selectedRouteId.replace(/^iett:/, '');
    const occurrence = stop.routes.find(([routeKey, directionId]) => (routeKey === selectedRouteId || routeKey === currentCode) && directionId === selectedDirectionId)
      ?? stop.routes.find(([routeKey]) => routeKey === selectedRouteId || routeKey === currentCode)
      ?? stop.routes[0];
    if (occurrence) openStopOnRoute(stop.id, occurrence);
  };

  const toggleFavorite = () => {
    const next = favorites.includes(selectedRoute.id) ? favorites.filter((id) => id !== selectedRoute.id) : [...favorites,selectedRoute.id];
    setFavorites(next);
    window.localStorage.setItem(USER_STATE_KEYS.favoriteRoutes,JSON.stringify(next));
    setToast(next.includes(selectedRoute.id) ? 'Hat favorilere eklendi' : 'Hat favorilerden çıkarıldı');
  };

  const toggleComparisonRoute = () => {
    const next = { routeId:selectedRoute.id, directionId:selectedDirection?.id ?? selectedDirectionId };
    setComparisonRouteKeys((current) => {
      const exists = current.some((item) => item.routeId === next.routeId && item.directionId === next.directionId);
      if (exists) {
        setToast('Hat karşılaştırmadan çıkarıldı');
        return current.filter((item) => !(item.routeId === next.routeId && item.directionId === next.directionId));
      }
      if (current.length >= 3) {
        setToast('Karşılaştırmaya en fazla 3 hat eklenebilir');
        return current;
      }
      setToast('Hat karşılaştırmaya eklendi');
      return [...current, next];
    });
  };

  const removeComparisonRoute = (routeId: string, directionId: string) => {
    setComparisonRouteKeys((current) => current.filter((item) => !(item.routeId === routeId && item.directionId === directionId)));
  };

  const clearComparisonRoutes = () => setComparisonRouteKeys([]);

  const toggleStopFavorite = () => {
    if (!selectedStop) return;
    const next = favoriteStopIds.includes(selectedStop.id) ? favoriteStopIds.filter((id) => id !== selectedStop.id) : [...favoriteStopIds,selectedStop.id];
    setFavoriteStopIds(next);
    window.localStorage.setItem(USER_STATE_KEYS.favoriteStops,JSON.stringify(next));
    setToast(next.includes(selectedStop.id) ? 'Durak favorilere eklendi' : 'Durak favorilerden çıkarıldı');
  };

  const rememberRecent = (item: RecentTransitItem) => {
    setRecents((current) => {
      const next = [item, ...current.filter((existing) => !(existing.kind === item.kind && existing.id === item.id))].slice(0, 6);
      window.localStorage.setItem(USER_STATE_KEYS.recents,JSON.stringify(next));
      return next;
    });
  };

  const copyRouteLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setToast('Hat bağlantısı panoya kopyalandı');
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch { /* Clipboard access can be unavailable outside secure contexts. */ }
  };

  const focusStop = () => {
    if (mapRef.current && selectedStop) mapRef.current.flyTo({ center:selectedStop.coordinates, zoom:Math.max(mapRef.current.getZoom(),14), duration:500 });
  };

  const selectApproachingVehicle = (vehicle: TransitVehicle) => {
    setSelectedStop(null);
    setSelectedVehicle(vehicle);
  };

  const findNearbyStops = () => {
    setManualLocationMode(false);
    manualLocationModeRef.current = false;
    setNearbyOpen(true);
    setSearch('');
    setRouteListOpen(true);
    if (!navigator.geolocation) {
      setLocationStatus('unavailable');
      return;
    }
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setUserLocation([coords.longitude,coords.latitude]);
      setLocationAccuracy(Number.isFinite(coords.accuracy) ? Math.round(coords.accuracy) : null);
      setLocationOrigin('browser');
      setLocationStatus('ready');
    }, (error) => {
      setLocationStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
    }, { enableHighAccuracy:true, maximumAge:60_000, timeout:10_000 });
  };

  const chooseLocationOnMap = () => {
    manualLocationModeRef.current = true;
    setManualLocationMode(true);
    setNearbyOpen(false);
    setRouteListOpen(false);
    setMobilePanelOpen(false);
  };

  const cancelManualLocation = () => {
    manualLocationModeRef.current = false;
    setManualLocationMode(false);
  };

  const toggleSavedManualLocation = () => {
    if (!userLocation || locationOrigin !== 'manual') return;
    if (savedManualLocation) {
      window.localStorage.removeItem(USER_STATE_KEYS.manualLocation);
      setSavedManualLocation(null);
      return;
    }
    const next = { coordinates:userLocation, savedAt:new Date().toISOString() };
    window.localStorage.setItem(USER_STATE_KEYS.manualLocation,JSON.stringify(next));
    setSavedManualLocation(next);
  };

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[var(--background)]">
      <div ref={mapContainerRef} className="absolute inset-0" aria-label="İstanbul ulaşım haritası" />

      {!mapReady && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-[var(--background)]">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[var(--primary-soft)] border-t-[var(--primary)]" />
            <p className="text-sm font-semibold">İstanbul haritası hazırlanıyor</p>
          </div>
        </div>
      )}

      <header className="glass-panel absolute left-3 right-3 top-3 z-30 flex h-16 items-center gap-3 rounded-2xl px-3 md:left-5 md:right-5 md:top-5 md:h-[68px] md:px-4">
        <div className="flex min-w-fit items-center gap-3 pr-1 md:w-[272px]">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--primary)] text-white shadow-lg"><Navigation2 className="h-5 w-5 rotate-45" /></div>
          <div className="hidden sm:block">
            <p className="flex items-center gap-1.5 text-[17px] font-bold leading-none tracking-tight">İstanbulum <span className="rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-[9px] font-bold tracking-normal text-[var(--muted)]">v{APP_VERSION}</span></p>
            <p className="mt-1 text-[10px] font-medium text-[var(--muted)]">Şehrin ulaşımı, tek haritada</p>
          </div>
        </div>
        <div className="relative mx-auto flex max-w-xl flex-1 items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--muted)]" />
          <input ref={searchInputRef} value={search} onChange={(e)=>{setSearch(e.target.value);setNearbyOpen(false);setRouteListOpen(true);}} onKeyDown={(event)=>{if(event.key==='Escape'){setSearch('');setRouteListOpen(false);} if(event.key==='Enter'&&regularRoutes[0]) selectRoute(regularRoutes[0]);}} onFocus={()=>setRouteListOpen(true)} placeholder="Hat veya durak ara" aria-label="Hat veya durak ara" aria-keyshortcuts="/ Escape Enter" className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] pl-10 pr-16 text-sm font-medium outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-soft)]" />
          {!search&&<kbd className="pointer-events-none absolute right-3 hidden rounded border border-[var(--border)] bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)] sm:block">/</kbd>}
          {search && <button onClick={()=>setSearch('')} aria-label="Aramayı temizle" className="absolute right-3 text-[var(--muted)]"><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex min-w-fit items-center justify-end gap-2 md:w-[272px]">
          <span className="hidden items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300 md:flex"><span className="h-2 w-2 rounded-full bg-amber-500" />{isOfficialRoute ? 'Kaynaklı hat ağı' : 'Demo veri'}</span>
          <Button variant="secondary" size="icon" aria-label="Yakınımdaki durakları göster" onClick={findNearbyStops}><LocateFixed className="h-4 w-4" /></Button>
          <Button variant="secondary" size="icon" aria-label="Uygulama hakkında" onClick={()=>setAboutOpen(true)}><Info className="h-4 w-4" /></Button>
          <Button variant="secondary" size="icon" aria-label="Temayı değiştir" onClick={()=>setTheme(resolvedTheme==='dark'?'light':'dark')}>
            <Moon className="h-4 w-4 dark:hidden" />
            <Sun className="hidden h-4 w-4 dark:block" />
          </Button>
        </div>
      </header>

      {toast&&<div role="status" aria-live="polite" className="glass-panel absolute left-1/2 top-[92px] z-[80] -translate-x-1/2 rounded-xl px-4 py-2.5 text-xs font-semibold shadow-xl">{toast}</div>}

      {aboutOpen&&<div className="absolute inset-0 z-[70] grid place-items-center bg-slate-950/35 p-3 backdrop-blur-[2px]" role="presentation" onClick={()=>setAboutOpen(false)}>
        <section ref={aboutDialogRef} role="dialog" aria-modal="true" aria-labelledby="about-title" className="glass-panel max-h-[min(620px,calc(100dvh-32px))] w-full max-w-md overflow-y-auto rounded-2xl p-5 shadow-2xl" onClick={(event)=>event.stopPropagation()}>
          <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--primary)]">İstanbulum</p><h2 id="about-title" className="mt-1 text-lg font-extrabold">Uygulama hakkında</h2></div><button type="button" aria-label="Bilgilendirme penceresini kapat" onClick={()=>setAboutOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"><X className="h-4 w-4" /></button></div>
          <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">İstanbulum; otobüs, metrobüs, metro, tramvay, füniküler, Marmaray ve vapur hatlarını durak, istasyon ve iskeleleriyle haritada incelemeyi kolaylaştıran bir keşif aracıdır. Yalnız İETT araçları uygun olduğunda canlı gösterilir; yolculuk planlama veya varış zamanı tahmini yapılmaz.</p>
          <div className="mt-5 space-y-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3"><p className="text-xs font-extrabold">Otobüs ve metrobüs verisi</p><p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">Güzergâh ve duraklar <a className="font-semibold text-[var(--primary)] underline underline-offset-2" href="https://data.ibb.gov.tr/" target="_blank" rel="noreferrer">İBB Açık Veri</a> kaynaklarından işlenir. Uygulamadaki veri tarihi: {ROUTE_DATA_UPDATED_LABEL}.</p></div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3"><p className="text-xs font-extrabold">Metro verisi</p><p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">Hat ve istasyon bilgileri <a className="font-semibold text-[var(--primary)] underline underline-offset-2" href="https://www.metro.istanbul/Hatlarimiz" target="_blank" rel="noreferrer">Metro İstanbul</a> kaynak doğrulamasıyla; ray geometrileri <a className="font-semibold text-[var(--primary)] underline underline-offset-2" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap katkıları</a> üzerinden alınır ve statik olarak sunulur.</p></div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3"><p className="text-xs font-extrabold">Raylı sistemler</p><p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">Tramvay ve füniküler bilgileri <a className="font-semibold text-[var(--primary)] underline underline-offset-2" href="https://www.metro.istanbul/Hatlarimiz" target="_blank" rel="noreferrer">Metro İstanbul</a>, Marmaray bilgisi TCDD Taşımacılık doğrulamasıyla; geometriler OpenStreetMap katkılarından statik olarak üretilir.</p></div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3"><p className="text-xs font-extrabold">Vapur ağı</p><p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]"><a className="font-semibold text-[var(--primary)] underline underline-offset-2" href="https://sehirhatlari.istanbul/tr/seferler" target="_blank" rel="noreferrer">Şehir Hatları</a> hat ve iskele sıraları statik katalog olarak sunulur. Haritadaki deniz çizgileri gerçek gemi izi değil, iskeleler arası şematik bağlantıdır.</p></div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3"><p className="text-xs font-extrabold">Canlı araç konumları</p><p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">Seçili otobüs veya metrobüs hattı için <a className="font-semibold text-[var(--primary)] underline underline-offset-2" href="https://api.ibb.gov.tr/iett/FiloDurum/SeferGerceklesme.asmx?wsdl" target="_blank" rel="noreferrer">İETT canlı araç konum servisi</a> üzerinden alınır. Kaynakta gecikme, eksik kayıt veya konum sapması olabilir.</p></div>
            <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary-soft)] p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-extrabold">Tarife ve biletler</p><p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">Güncel genel ücretleri, sınırlı geçiş biletlerini ve kaynak bilgisini inceleyin.</p></div><Button variant="secondary" size="sm" onClick={()=>{setAboutOpen(false);setFareCatalogOpen(true);}}><Ticket className="h-3.5 w-3.5" />Tarifeler</Button></div></div>
            <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary-soft)] p-3 text-[var(--foreground)]"><p className="text-xs font-extrabold">Bilgilendirme notu</p><p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">Gösterilen bilgiler bilgilendirme amaçlıdır; güncellik ve doğruluk veri sağlayıcılarına bağlıdır. Kesin sefer, varış saati veya operasyonel bilgi olarak kullanılmamalıdır.</p></div>
          </div>
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4"><span className="text-[10px] font-medium text-[var(--muted)]">v{APP_VERSION}</span><Button variant="secondary" size="sm" onClick={()=>setAboutOpen(false)}>Tamam</Button></div>
        </section>
      </div>}

      {fareCatalogOpen&&<FareCatalogDialog catalog={fareCatalogQuery.data?.data} onClose={()=>setFareCatalogOpen(false)} />}
      {scheduleDetailsOpen&&<ScheduleDialog routeCode={selectedRoute.code} routeName={selectedRoute.name} dataset={scheduleQuery.data?.data} selectedDirectionId={selectedDirection?.id ?? selectedDirectionId} loading={scheduleManifestQuery.isLoading || Boolean(schedulePath&&scheduleQuery.isLoading)} error={scheduleManifestQuery.isError || scheduleQuery.isError} unavailable={scheduleManifestQuery.isSuccess&&!schedulePath} onRetry={()=>{void scheduleManifestQuery.refetch();if(schedulePath)void scheduleQuery.refetch();}} onClose={()=>setScheduleDetailsOpen(false)} />}

      {manualLocationMode&&<div className="glass-panel absolute left-1/2 top-[92px] z-40 flex w-[min(360px,calc(100%-24px))] -translate-x-1/2 items-center justify-between gap-3 rounded-xl px-3 py-2.5"><span className="text-xs font-bold"><MapPin className="mr-1.5 inline h-4 w-4 text-[var(--primary)]" />Haritadan konumunu seç</span><Button variant="ghost" size="sm" onClick={cancelManualLocation}>Vazgeç</Button></div>}

      {routeListOpen && (
        <section className="glass-panel absolute left-3 right-3 top-[84px] z-20 max-h-[52vh] overflow-hidden rounded-2xl md:left-5 md:right-auto md:top-[104px] md:w-[340px]" aria-label="Arama sonuçları">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{nearbyOpen?'Yakındaki duraklar':search.trim()?'Arama':'Hatlar'}</p><p className="mt-0.5 text-sm font-semibold">{nearbyOpen?(locationStatus==='ready'?`${nearbyStops.length} en yakın durak`:'Konum bekleniyor'):search.trim()?`${filteredRoutes.length} hat · ${filteredStops.length} durak`:`${filteredRoutes.length} hat`}</p></div>
            <Button variant="ghost" size="icon" onClick={()=>{setRouteListOpen(false);setNearbyOpen(false);}} aria-label="Arama sonuçlarını kapat"><X className="h-4 w-4" /></Button>
          </div>
          {!nearbyOpen && <div className="flex gap-1.5 border-b border-[var(--border)] px-3 py-2" role="group" aria-label="Ulaşım türü filtresi">
            {([['all','Tümü'],['road','Otobüs'],['rail','Raylı'],['ferry','Vapur']] as const).map(([value,label])=><button key={value} type="button" onClick={()=>setRouteModeFilter(value)} aria-pressed={routeModeFilter===value} className={cn('rounded-lg px-2.5 py-1 text-[10px] font-bold transition',routeModeFilter===value?'bg-[var(--primary)] text-white':'bg-[var(--surface-muted)] text-[var(--muted)] hover:text-[var(--foreground)]')}>{label}</button>)}
          </div>}
          <div className="max-h-[42vh] space-y-1 overflow-y-scroll overscroll-contain p-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {nearbyOpen ? <><p className="px-3 pt-2 text-[10px] leading-relaxed text-[var(--muted)]">Konum yalnızca bu cihazda, en yakın durakları sıralamak için kullanılır.</p><div className="grid grid-cols-2 gap-2 px-3 pt-3"><Button variant="secondary" size="sm" onClick={chooseLocationOnMap}><MapPin className="h-3.5 w-3.5" />Haritadan seç</Button><Button variant="ghost" size="sm" onClick={findNearbyStops}><LocateFixed className="h-3.5 w-3.5" />Konumu yenile</Button></div>{locationOrigin==='manual'&&<Button variant="ghost" size="sm" className="mx-3 mt-2 w-[calc(100%-24px)]" onClick={toggleSavedManualLocation}>{savedManualLocation?'Kaydedilen konumu unut':'Bu konumu bu cihazda hatırla'}</Button>}{(locationStatus==='loading'||(locationStatus==='ready'&&stopIndexQuery.isLoading))&&<div className="px-5 py-10 text-center"><LocateFixed className="mx-auto h-6 w-6 animate-pulse text-[var(--primary)]" /><p className="mt-3 text-sm font-bold">Yakındaki duraklar hazırlanıyor</p><p className="mt-1 text-xs text-[var(--muted)]">Konum ve resmî durak verisi eşleştiriliyor.</p></div>}{locationStatus==='denied'&&<NearbyStatus title="Konum izni gerekli" description="Tarayıcı ayarlarından konum iznini verdikten sonra tekrar deneyin." onRetry={findNearbyStops} />}{locationStatus==='unavailable'&&<NearbyStatus title="Konum alınamadı" description="Konum servisinin açık olduğundan emin olup tekrar deneyin." onRetry={findNearbyStops} />}{stopIndexQuery.isError&&<NearbyStatus title="Durak verisi yüklenemedi" description="Bağlantıyı kontrol edip tekrar deneyin." onRetry={findNearbyStops} />}{locationStatus==='ready'&&!stopIndexQuery.isLoading&&!stopIndexQuery.isError&&nearbyStops.map(({stop,distance})=><NearbyStopResult key={stop.id} stop={stop} distance={distance} onSelect={selectStopResult} />)}</> : <>{!search.trim()&&recents.length>0&&<><p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Son bakılanlar</p>{recents.slice(0,3).map((item)=><RecentResult key={`${item.kind}-${item.id}`} item={item} onRoute={selectRoute} onStop={selectStopResult} routes={filteredRoutes} stops={stopById} />)}</>}{!search.trim() && favoriteRoutes.length>0&&<><p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Hat favorileri</p>{favoriteRoutes.map((route)=><RouteResult key={route.id} route={route} selected={selectedRoute.id===route.id} favorite onSelect={selectRoute} />)}</>}{!search.trim() && favoriteStops.length>0&&<><p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Durak favorileri</p>{favoriteStops.map((stop)=><StopResult key={stop.id} stop={stop} onSelect={selectStopResult} />)}</>}{!search.trim()&&regularRoutes.length>0&&<p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Tüm hatlar</p>}{search.trim()&&regularRoutes.length>0&&<p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Hatlar</p>}{regularRoutes.map((route)=><RouteResult key={route.id} route={route} selected={selectedRoute.id===route.id} favorite={favorites.includes(route.id)} onSelect={selectRoute} />)}{normalizedSearch.length>=2&&stopIndexQuery.isLoading&&<div className="px-4 py-5 text-center text-xs font-medium text-[var(--muted)]">Duraklar yükleniyor…</div>}{search.trim()&&filteredStops.length>0&&<><p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Duraklar</p>{filteredStops.slice(0,20).map((stop)=><StopResult key={stop.id} stop={stop} onSelect={selectStopResult} />)}{filteredStops.length>20&&<p className="px-3 py-2 text-center text-[10px] font-medium text-[var(--muted)]">İlk 20 durak gösteriliyor · Aramayı daraltın</p>}</>}{search.trim()&&!filteredRoutes.length&&!filteredStops.length&&!stopIndexQuery.isLoading&&<div className="px-5 py-10 text-center"><Search className="mx-auto h-6 w-6 text-[var(--muted)]" /><p className="mt-3 text-sm font-bold">Sonuç bulunamadı</p><p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{normalizedSearch.length<2?'Durak aramak için en az 2 karakter yazın.':'Hat kodunu, hat adını veya durak adını farklı yazarak tekrar deneyin.'}</p><Button variant="ghost" size="sm" className="mt-3" onClick={()=>setSearch('')}>Aramayı temizle</Button></div>}</>}
          </div>
          {nearbyOpen && locationOrigin==='browser' && locationAccuracy!==null && <p className="border-t border-[var(--border)] px-4 py-2 text-[10px] font-medium text-[var(--muted)]">Tarayıcı konumu doğruluğu: yaklaşık ±{locationAccuracy} m</p>}
          {!nearbyOpen && <div className="border-t border-[var(--border)] px-4 py-2.5 text-[10px] font-medium text-[var(--muted)]">Statik ulaşım verisi · {routes.length.toLocaleString('tr-TR')} hat{stopIndexQuery.data?.meta?.stopCount ? ` · ${stopIndexQuery.data.meta.stopCount.toLocaleString('tr-TR')} durak/istasyon` : ''}</div>}
        </section>
      )}

      {!routeListOpen && <Button className="absolute left-5 top-[104px] z-20 hidden shadow-lg md:inline-flex" onClick={()=>setRouteListOpen(true)}><BusFront className="h-4 w-4" />Hatları göster</Button>}

      <aside className={cn('glass-panel absolute bottom-3 left-3 right-3 z-20 max-h-[58vh] overflow-y-auto rounded-2xl transition-transform md:bottom-auto md:left-auto md:right-5 md:top-[104px] md:max-h-[calc(100vh-128px)] md:w-[350px]',!mobilePanelOpen&&'translate-y-[calc(100%+24px)] md:translate-y-0')}>
        <div className="sticky top-0 z-30 bg-[var(--surface-strong)] shadow-[0_8px_18px_rgba(0,0,0,0.12)]">
        <div className="isolate border-b border-[var(--border)] px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="grid h-12 min-w-16 shrink-0 place-items-center rounded-xl text-base font-black text-white" style={{background:selectedRoute.color}}>{selectedRoute.code}</div>
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">{selectedRoute.mode}</span><span title={isOfficialRoute?'Kaynağı belirtilmiş ulaşım ağı':'Demo veri'} className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-300"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{isOfficialRoute ? 'kaynaklı' : 'demo'}</span></div><h1 className="mt-1.5 text-base font-extrabold leading-tight">{selectedRoute.name}</h1></div>
            <Button variant="ghost" size="icon" onClick={toggleFavorite} aria-label={favorites.includes(selectedRoute.id)?'Hattı favorilerden çıkar':'Hattı favorilere ekle'}><Star className={cn('h-4 w-4',favorites.includes(selectedRoute.id)&&'fill-amber-400 text-amber-500')} /></Button>
            <Button variant="ghost" size="icon" onClick={copyRouteLink} aria-label={linkCopied?'Hat bağlantısı kopyalandı':'Hat bağlantısını kopyala'}>{linkCopied?<Check className="h-4 w-4 text-emerald-500" />:<Share2 className="h-4 w-4" />}</Button>
            <Button variant="ghost" size="icon" className="md:hidden" onClick={()=>setMobilePanelOpen(false)} aria-label="Detayı kapat"><X className="h-4 w-4" /></Button>
          </div>
        </div>
        <nav className="flex gap-1 border-b border-[var(--border)] px-3 py-2" aria-label="Hat detayı bölümleri">
          {[['route-summary','Özet'],...(hasLiveVehicles ? [['route-vehicles','Araçlar']] : []),['route-stops','Duraklar']].map(([id,label])=><button key={id} type="button" onClick={()=>scrollPanelToSection(id)} className="flex-1 rounded-lg bg-[var(--surface-muted)] px-2 py-1.5 text-[10px] font-bold text-[var(--muted)] transition hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]">{label}</button>)}
        </nav>
        </div>
        <div className="p-4">
          {routeData.directions && routeData.directions.length > 1 && <div className="mb-4"><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Yön seçimi</p><div className="grid grid-cols-2 gap-2">{routeData.directions.map((direction)=><button key={direction.id} type="button" aria-pressed={selectedDirection?.id===direction.id} onClick={()=>setSelectedDirectionId(direction.id)} className={cn('rounded-xl border px-3 py-2.5 text-left transition',selectedDirection?.id===direction.id?'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]':'border-[var(--border)] bg-[var(--surface-muted)] hover:border-[var(--primary)]')}><span className="block text-[9px] font-black uppercase tracking-wide opacity-70">Başlangıç → Bitiş</span><span className="mt-1 block line-clamp-2 text-xs font-bold">{direction.name}</span></button>)}</div></div>}
          <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Hat karşılaştır</p><p className="mt-1 text-[10px] text-[var(--muted)]">Haritada en fazla 3 hat tut.</p></div><Button variant="secondary" size="sm" disabled={!comparisonRouteKeys.some((item)=>item.routeId===selectedRoute.id&&item.directionId===(selectedDirection?.id??selectedDirectionId))&&comparisonRouteKeys.length>=3} onClick={toggleComparisonRoute}><RouteIcon className="h-3.5 w-3.5" />{comparisonRouteKeys.some((item)=>item.routeId===selectedRoute.id&&item.directionId===(selectedDirection?.id??selectedDirectionId))?'Çıkar':'Ekle'}</Button></div>{comparisonRouteKeys.length>0&&<><div className="mt-2 flex flex-wrap gap-1.5">{comparisonRouteKeys.map((item)=>{const route=routes.find((candidate)=>candidate.id===item.routeId);return <button key={`${item.routeId}-${item.directionId}`} onClick={()=>removeComparisonRoute(item.routeId,item.directionId)} className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-strong)] px-2 py-1 text-[10px] font-bold text-[var(--muted)] hover:text-[var(--foreground)]"><span className="h-1.5 w-1.5 rounded-full" style={{background:route?.color??'var(--primary)'}} />{route?.code??item.routeId.replace('iett:','')}<X className="h-3 w-3" /></button>;})}</div><button type="button" onClick={clearComparisonRoutes} className="mt-2 text-[10px] font-bold text-[var(--muted)] transition hover:text-[var(--foreground)]">Karşılaştırmayı temizle</button></>}</div>
          <div id="route-summary" className="scroll-mt-32 grid grid-cols-3 gap-2">{hasLiveVehicles?<Metric icon={<BusFront />} value={liveVehiclesLoading?'…':String(selectedRoute.vehicles.length)} label="canlı araç" />:<Metric icon={<TramFront />} value="Statik" label="hat verisi" />}<Metric icon={<MapPin />} value={String(selectedRoute.stops.length)} label={stopKind(selectedRoute.mode)} /><Metric icon={<Clock3 />} value={selectedRoute.durationMinutes?`${selectedRoute.durationMinutes} dk`:'—'} label="tek yön" /></div>
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Ücret tarifesi</p><p className="mt-1 text-sm font-bold">{resolvedFare?.shortLabel ?? selectedRoute.fareLabel}</p></div>
              <span className="rounded-lg bg-[var(--surface-strong)] px-2.5 py-1.5 text-xs font-semibold text-[var(--muted)]">{resolvedFare ? fareVerificationLabel(resolvedFare.verification) : isOfficialRoute ? 'Kaynaklı veri' : 'Demo veri'}</span>
            </div>
            {resolvedFare&&<><Button variant="ghost" size="sm" className="mt-2 h-8 w-full justify-between border border-[var(--border)] bg-[var(--surface-strong)] px-2.5 text-[11px]" onClick={()=>setFareDetailsOpen((open)=>!open)} aria-expanded={fareDetailsOpen}><span>{fareDetailsOpen?'Tarife ayrıntılarını gizle':'Tarifeyi gör'}</span><ChevronRight className={cn('h-3.5 w-3.5 transition-transform',fareDetailsOpen&&'rotate-90')} /></Button>{fareDetailsOpen&&<FareDetails fare={resolvedFare} />}</>}
            {isOfficialRoute&&<div className="mt-3 border-t border-[var(--border)] pt-2.5 text-[10px] leading-relaxed text-[var(--muted)]"><div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><span>Güzergâh verisi: {selectedRoute.geometrySourceUrl?<a className="font-semibold text-[var(--primary)] underline underline-offset-2" href={selectedRoute.geometrySourceUrl} target="_blank" rel="noreferrer">{selectedRoute.geometrySource ?? selectedRoute.sourceLabel ?? 'Kaynak'}</a>:(selectedRoute.sourceLabel ?? (selectedRoute.mode==='Metro'?'Metro İstanbul + OpenStreetMap':'İBB Açık Veri'))}{formatSourceDate(selectedRoute.geometrySourceUpdatedAt ?? selectedRoute.sourceUpdatedAt)&&` · ${formatSourceDate(selectedRoute.geometrySourceUpdatedAt ?? selectedRoute.sourceUpdatedAt)}`}</span>{hasLiveVehicles&&<span>{liveSourceUpdatedLabel}</span>}</div><p className="mt-1">{hasLiveVehicles?'Canlı konumlar bilgilendirme amaçlıdır; harita işaretçisi iki kaynak kaydı arasında görsel olarak yumuşatılabilir, kesin sefer veya varış bilgisi değildir.':selectedRoute.mode==='Vapur'?'İskele sırası Şehir Hatları kaynağından alınır; çizgi, güncel gemi GPS izi değil İBB Açık Veri vektör verisine dayalı statik yaklaşık güzergâhtır.':`Bu hat statik güzergâh ve ${stopKind(selectedRoute.mode)} verisiyle gösterilir; canlı araç konumu sorgulanmaz.`}</p></div>}
          </div>
          {selectedRouteId.startsWith('iett:') && <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300" /><p className="text-xs font-extrabold">İETT duyuruları</p><span className="ml-auto text-[9px] font-semibold text-[var(--muted)]">{announcementsQuery.data?.meta.cacheStatus === 'stale' ? 'önceki yanıt' : 'kaynaklı'}</span></div>
            {announcementsQuery.isLoading && <p className="mt-2 text-[10px] text-[var(--muted)]">Duyurular kontrol ediliyor…</p>}
            {announcementsQuery.isError && <p className="mt-2 text-[10px] text-[var(--muted)]">Duyurular geçici olarak alınamadı. Hat ve araç bilgileri kullanılmaya devam ediyor.</p>}
            {!announcementsQuery.isLoading && !announcementsQuery.isError && !(announcementsQuery.data?.data.length) && <p className="mt-2 text-[10px] text-[var(--muted)]">Bu hat için aktif duyuru bulunmuyor.</p>}
            {announcementsQuery.data?.data.slice(0, 3).map((announcement) => <details key={announcement.id} className="mt-2 rounded-lg bg-[var(--surface-strong)] p-2"><summary className="cursor-pointer text-[11px] font-bold">{announcement.title}</summary><p className="mt-2 text-[10px] leading-relaxed text-[var(--muted)]">{announcement.description}</p><a className="mt-1 inline-block text-[10px] font-semibold text-[var(--primary)] underline" href={announcement.sourceUrl} target="_blank" rel="noreferrer">İETT kaynağını aç</a></details>)}
          </div>}
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
            <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Planlı seferler</p><p className="mt-1 text-sm font-bold">Hareket saatleri</p></div><span className="rounded-lg bg-[var(--surface-strong)] px-2.5 py-1.5 text-xs font-semibold text-[var(--muted)]">Statik veri</span></div>
            <Button variant="ghost" size="sm" className="mt-2 h-8 w-full justify-between border border-[var(--border)] bg-[var(--surface-strong)] px-2.5 text-[11px]" onClick={()=>setScheduleDetailsOpen(true)} aria-haspopup="dialog"><span>Sefer saatlerini gör</span><ChevronRight className="h-3.5 w-3.5" /></Button>
            <p className="mt-2 text-[9px] leading-relaxed text-[var(--muted)]">Yalnızca bu hatta ait planlı saatler açılır.</p>
          </div>
          {hasLiveVehicles&&<><div id="route-vehicles" className="mt-5 flex scroll-mt-32 items-center justify-between gap-3"><h2 className="text-sm font-extrabold">Hat üzerindeki araçlar</h2><span className="text-right text-xs font-medium text-[var(--muted)]">{liveVehicleStatusLabel}</span></div>
          <div className="mt-2 space-y-2">
            {!selectedRoute.vehicles.length&&<div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-4 py-5 text-center"><BusFront className={cn('mx-auto h-5 w-5 text-[var(--muted)]',liveVehiclesLoading&&'animate-pulse text-[var(--primary)]')} /><p className="mt-2 text-xs font-bold">{liveVehiclesLoading?'Canlı araçlar aranıyor':liveVehiclesUnavailable?'Canlı veri geçici olarak alınamadı':'Bu yönde aktif araç bulunamadı'}</p><p className="mt-1 text-[10px] leading-relaxed text-[var(--muted)]">{liveVehiclesUnavailable?'Güzergâh ve duraklar kullanılmaya devam ediyor.':'Yön değiştirerek diğer araçları görebilirsiniz.'}</p></div>}
            {selectedRoute.vehicles.map((vehicle)=>(
              <button key={vehicle.id} onClick={()=>{setSelectedStop(null);setSelectedVehicle(vehicle);}} className={cn('flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3 text-left transition hover:border-[var(--primary)]',selectedVehicle?.id===vehicle.id&&'border-[var(--primary)] ring-2 ring-[var(--primary-soft)]')}>
                <span className="grid h-9 w-9 place-items-center rounded-lg text-white" style={{background:selectedRoute.color}}><BusFront className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{vehicle.doorCode}</span><span className="mt-0.5 block truncate text-[10px] font-bold text-[var(--primary)]">{vehicleDirectionName(vehicle, routeData.directions)}</span><span className="mt-0.5 block truncate text-xs text-[var(--muted)]">Yakın: {vehicle.nextStop}</span></span>
                <span className="text-right text-xs"><span title={vehicleFreshnessDescription(vehicle.updatedSecondsAgo)} className={cn('block cursor-help font-bold',vehicleFreshnessClass(vehicle.updatedSecondsAgo))}>{vehicleFreshnessLabel(vehicle.updatedSecondsAgo)}</span><span className="text-[var(--muted)]">{vehicleAgeLabel(vehicle.updatedSecondsAgo)}</span></span>
              </button>
            ))}
          </div></>}
          <div id="route-stops" className="mt-5 flex scroll-mt-32 items-center justify-between"><h2 className="text-sm font-extrabold">Güzergâh {stopKindPlural(selectedRoute.mode)}</h2><span className="text-xs font-medium text-[var(--muted)]">{selectedRoute.stops.length ? 'Haritada tıklanabilir' : 'Veri bekleniyor'}</span></div>
          <div className="relative mt-3 space-y-0 pl-1">
            {selectedRoute.stops.map((stop,index)=>{const isStart=index===0;const isEnd=index===selectedRoute.stops.length-1;return (
              <button key={`${stop.id}-${index}`} onClick={()=>{setSelectedVehicle(null);setSelectedStop(stop);rememberRecent({ kind:'stop', id:stop.id, title:stop.name, subtitle:stop.district, routeId:selectedRoute.id, routeCode:selectedRoute.code, directionId:selectedDirectionId });}} className={cn('relative flex min-h-14 w-full gap-3 rounded-xl pb-3 text-left transition',(isStart||isEnd)&&'mb-1 px-2 pt-2',isStart&&'bg-emerald-500/10',isEnd&&'bg-red-500/10',selectedStop?.id===stop.id&&'bg-[var(--primary-soft)] px-2')}><>{index<selectedRoute.stops.length-1&&<span className={cn('absolute top-4 h-full w-0.5 bg-[var(--border)]',(isStart||isEnd)?'left-[17px]':'left-[7px]')} />}<span className={cn('relative z-10 mt-1.5 rounded-full border-[3px] transition',isStart||isEnd?'h-5 w-5':'h-4 w-4')} style={{borderColor:selectedStop?.id===stop.id?'#ffffff':isStart?'#16a34a':isEnd?'#dc2626':selectedRoute.color, background:selectedStop?.id===stop.id?selectedRoute.color:isStart?'#16a34a':isEnd?'#dc2626':undefined}} /><span className="min-w-0"><span className="flex flex-wrap items-center gap-1.5"><span className="text-sm font-semibold">{stop.name}</span>{isStart&&<span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-black text-white">BAŞLANGIÇ</span>}{isEnd&&<span className="rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-black text-white">BİTİŞ</span>}</span><span className="mt-0.5 block text-xs text-[var(--muted)]">{stop.district}</span></span></></button>
            );})}
          </div>
        </div>
      </aside>

      {selectedVehicle && (
        <div className="glass-panel absolute bottom-5 left-1/2 z-30 w-[min(420px,calc(100%-24px))] -translate-x-1/2 rounded-2xl p-4 md:left-[calc(50%-10px)]">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl text-white" style={{background:selectedRoute.color}}><BusFront className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="font-extrabold">{selectedVehicle.doorCode}</p>
                <span title={selectedVehicle.source==='ibb-iett-live'?vehicleFreshnessDescription(selectedVehicle.updatedSecondsAgo):'DEMO: geliştirme amaçlı örnek araç verisi.'} className={cn('cursor-help rounded-md px-1.5 py-0.5 text-[10px] font-bold',selectedVehicle.source==='ibb-iett-live'?vehicleBadgeClass(selectedVehicle.updatedSecondsAgo):'bg-slate-500/10 text-slate-600 dark:text-slate-300')}>{selectedVehicle.source==='ibb-iett-live'?vehicleFreshnessLabel(selectedVehicle.updatedSecondsAgo):'DEMO'}</span>
              </div>
              <p className="mt-0.5 truncate text-[10px] font-bold text-[var(--primary)]">{vehicleDirectionName(selectedVehicle, routeData.directions)}</p>
              <p className="mt-0.5 truncate text-xs text-[var(--muted)]">Yakın: {selectedVehicle.nextStop}</p>
            </div>
            <div className="text-right"><p className="text-sm font-extrabold">{selectedVehicle.source==='ibb-iett-live'?'Konum':`${selectedVehicle.speed} km/sa`}</p><p className="text-[10px] text-[var(--muted)]">Son veri: {vehicleAgeLabel(selectedVehicle.updatedSecondsAgo)}</p></div>
            <Button variant="ghost" size="icon" onClick={()=>setSelectedVehicle(null)} aria-label="Araç kartını kapat"><X className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
      {selectedStop && (
        <div className="glass-panel absolute bottom-5 left-1/2 z-30 w-[min(420px,calc(100%-24px))] -translate-x-1/2 rounded-2xl p-3 md:left-[calc(50%-10px)]">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{background:selectedRoute.color}}><MapPin className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-extrabold">{selectedStop.name}</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{selectedStop.district} · {selectedStopIndex+1}. durak / {selectedRoute.stops.length}</p>
              <p className="mt-1 truncate text-[10px] font-medium text-[var(--muted)]">{selectedDirection?.name??selectedRoute.name}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={toggleStopFavorite} aria-label={favoriteStopIds.includes(selectedStop.id)?'Durağı favorilerden çıkar':'Durağı favorilere ek'} title={favoriteStopIds.includes(selectedStop.id)?'Durağı favorilerden çıkar':'Durağı favorilere ek'}><Star className={cn('h-4 w-4',favoriteStopIds.includes(selectedStop.id)&&'fill-amber-400 text-amber-500')} /></Button>
            <Button variant="ghost" size="icon" onClick={()=>setSelectedStop(null)} aria-label="Durak kartını kapat"><X className="h-4 w-4" /></Button>
          </div>

          <details className="group mt-3 border-t border-[var(--border)] pt-2">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-[var(--primary)]/40 bg-[var(--primary-soft)] px-3 py-2.5 text-xs font-bold text-[var(--foreground)] shadow-sm transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] [&::-webkit-details-marker]:hidden">
              <span>{hasLiveVehicles&&approachingVehicles.length>0?`${approachingVehicles.length} yaklaşan araç · `:''}{stopIndexQuery.isLoading?'Hatlar yükleniyor…':`${new Set(selectedStopOccurrences.map(({route})=>route.id)).size} hat`}</span>
              <span className="flex items-center gap-1.5 text-[10px] font-extrabold text-[var(--primary)]">
                <span className="group-open:hidden">Ayrıntıları göster</span>
                <span className="hidden group-open:inline">Ayrıntıları gizle</span>
                <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
              </span>
            </summary>
            <div className="mt-2 max-h-[46vh] space-y-3 overflow-y-auto pr-1">
              <p className="font-mono text-[10px] text-[var(--muted)]">Konum: {selectedStop.coordinates[1].toFixed(5)}, {selectedStop.coordinates[0].toFixed(5)}</p>
              {hasLiveVehicles && <div className="border-t border-[var(--border)] pt-3">
                <div className="mb-2 flex items-center justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Bu durağa yaklaşan araçlar</p><span className="rounded-md px-1.5 py-0.5 text-[9px] font-black text-white" style={{background:selectedRoute.color}}>{selectedRoute.code}</span></div>
                {liveVehiclesLoading && <p className="rounded-lg bg-[var(--surface-muted)] px-3 py-3 text-center text-[10px] font-medium text-[var(--muted)]">Canlı araçlar kontrol ediliyor…</p>}
                {liveVehiclesUnavailable && <p className="rounded-lg bg-amber-500/10 px-3 py-3 text-center text-[10px] font-medium text-amber-700 dark:text-amber-300">Canlı araç kaynağına şu anda erişilemiyor.</p>}
                {!liveVehiclesLoading&&!liveVehiclesUnavailable&&approachingVehicles.length===0&&<p className="rounded-lg bg-[var(--surface-muted)] px-3 py-3 text-center text-[10px] font-medium text-[var(--muted)]">Seçili hat ve yönde durağa yaklaşan aktif araç bulunamadı.</p>}
                {approachingVehicles.length>0&&<div className="space-y-1.5">{approachingVehicles.map((item)=><button key={item.vehicle.id} type="button" onClick={()=>selectApproachingVehicle(item.vehicle)} aria-label={`${item.vehicle.doorCode} aracını haritada göster`} className="flex w-full items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-2.5 text-left transition hover:border-[var(--primary)]"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white" style={{background:selectedRoute.color}}><BusFront className="h-3.5 w-3.5" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-extrabold">{item.vehicle.doorCode}</span><span className="block truncate text-[10px] font-semibold text-[var(--primary)]">{approachingVehicleLabel(item)}</span></span><span className="text-right"><span title={vehicleFreshnessDescription(item.vehicle.updatedSecondsAgo)} className={cn('block cursor-help text-[9px] font-black',vehicleFreshnessClass(item.vehicle.updatedSecondsAgo))}>{vehicleFreshnessLabel(item.vehicle.updatedSecondsAgo)}</span><span className="block text-[9px] text-[var(--muted)]">{vehicleAgeLabel(item.vehicle.updatedSecondsAgo)}</span></span></button>)}</div>}
                <p className="mt-2 text-[9px] leading-relaxed text-[var(--muted)]">Sıralama, aracın seçili yön güzergâhındaki yaklaşık konumuna dayanır; süre tahmini değildir.</p>
              </div>}
              {stopIndexQuery.isLoading&&<p className="text-center text-[10px] font-medium text-[var(--muted)]">Duraktan geçen hatlar yükleniyor…</p>}
              {selectedStopOccurrences.length>0&&<div className="border-t border-[var(--border)] pt-3"><div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Bu duraktan geçen hatlar</p><span className="text-[10px] font-semibold text-[var(--muted)]">{new Set(selectedStopOccurrences.map(({route})=>route.id)).size} hat</span></div><div className="grid max-h-32 grid-cols-2 gap-2 overflow-y-auto pr-1">{selectedStopOccurrences.map(({occurrence,route})=>{const directionName=occurrenceDirectionName(route,occurrence[1]);return <button key={`${occurrence[0]}-${occurrence[1]}`} onClick={()=>openStopOnRoute(selectedStop.id,occurrence)} className={cn('flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-2 text-left transition hover:border-[var(--primary)]',route.id===selectedRoute.id&&occurrence[1]===selectedDirectionId&&'border-[var(--primary)] bg-[var(--primary-soft)]')}><span className="grid h-7 min-w-10 place-items-center rounded-md text-[10px] font-black text-white" style={{background:route.color}}>{route.code}</span><span className="min-w-0"><span title={directionName} className="block truncate text-[10px] font-bold">{directionName}</span><span className="block text-[9px] text-[var(--muted)]">{occurrence[2]}. durak</span></span></button>;})}</div></div>}
              <Button variant="secondary" size="sm" className="w-full" onClick={focusStop}><LocateFixed className="h-3.5 w-3.5" />Durağa odaklan</Button>
            </div>
          </details>
        </div>
      )}

      <div className="absolute bottom-5 left-5 z-10 hidden items-center gap-2 md:flex"><Button variant="secondary" size="sm" onClick={chooseLocationOnMap}><MapPin className="h-3.5 w-3.5" />Haritadan seç</Button><Button variant="secondary" size="sm" onClick={findNearbyStops}><LocateFixed className="h-3.5 w-3.5" />Yakındaki duraklar</Button></div>
      {!mobilePanelOpen&&<Button className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 shadow-xl md:hidden" onClick={()=>setMobilePanelOpen(true)}><BusFront className="h-4 w-4" />{selectedRoute.code} detayları</Button>}
    </main>
  );
}

function Metric({ icon,value,label }: { icon:React.ReactNode; value:string; label:string }) {
  return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3"><div className="mb-2 h-4 w-4 text-[var(--primary)] [&>svg]:h-4 [&>svg]:w-4">{icon}</div><p className="text-sm font-extrabold">{value}</p><p className="mt-0.5 text-[10px] font-medium text-[var(--muted)]">{label}</p></div>;
}

function FareDetails({ fare }: { fare:ResolvedFare }) {
  const prices = fare.pricesKurus
    ? (Object.entries(PRICE_CATEGORY_LABEL) as Array<[FarePriceKey,string]>)
      .map(([key,label]) => [label,key] as const)
      .filter(([, key]) => fare.pricesKurus?.[key] !== undefined)
    : [];

  return <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-2.5 text-[10px]">
    <div className="flex items-center justify-between gap-2"><p className="font-bold">{fare.label}</p><a href={fare.source.url} target="_blank" rel="noreferrer" className="font-semibold text-[var(--primary)] underline underline-offset-2">Kaynak</a></div>
    {prices.length>0&&<div className="mt-2 grid grid-cols-2 gap-1.5">{prices.map(([label,key])=><div key={key} className="rounded-md bg-[var(--surface-muted)] px-2 py-1.5"><span className="flex items-center gap-1 text-[9px] text-[var(--muted)]">{label}{PRICE_CATEGORY_HELP[key]&&<span title={PRICE_CATEGORY_HELP[key]} aria-label={`${label} açıklaması`} className="cursor-help text-[var(--primary)]"><Info className="h-3 w-3" /></span>}</span><span className="block text-xs font-extrabold">{formatFare(fare.pricesKurus?.[key])}</span></div>)}</div>}
    {fare.bands&&<div className="mt-2 max-h-36 space-y-1 overflow-y-auto pr-1">{fare.bands.map((band)=><div key={band.label} className="flex items-center justify-between gap-2 rounded-md bg-[var(--surface-muted)] px-2 py-1.5"><span className="font-semibold">{band.label}</span><span className="text-right font-bold">{formatFare(band.pricesKurus.full)}</span></div>)}</div>}
    <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 border-t border-[var(--border)] pt-2 text-[9px] text-[var(--muted)]"><span>{formatSourceDate(fare.effectiveFrom)} itibarıyla</span>{fare.subscriptionLimit&&<span>· Abonman: {fare.subscriptionLimit} limit</span>}{fare.limitedUseTicketCount&&<span>· Sınırlı bilet: {fare.limitedUseTicketCount} geçiş</span>}</div>
    {[fare.note,...(fare.notes ?? [])].filter(Boolean).map((note)=><p key={note} className="mt-1 text-[9px] leading-relaxed text-[var(--muted)]">{note}</p>)}
  </div>;
}

function FareCatalogDialog({ catalog,onClose }: { catalog:FareCatalog | undefined; onClose:()=>void }) {
  const dialogRef = useDialogFocus<HTMLElement>(onClose);
  const generalFare = catalog?.profiles.find((profile) => profile.id === 'urban-standard');
  const source = catalog?.sources.find((item) => item.id === 'tuhim-2026-07-20');
  const prices = generalFare?.pricesKurus
    ? (Object.entries(PRICE_CATEGORY_LABEL) as Array<[FarePriceKey,string]>).map(([key,label]) => [label,key] as const).filter(([, key]) => generalFare.pricesKurus?.[key] !== undefined)
    : [];

  return <div className="absolute inset-0 z-[80] grid place-items-center bg-slate-950/35 p-3 backdrop-blur-[2px]" role="presentation" onClick={onClose}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="fare-catalog-title" className="glass-panel max-h-[min(680px,calc(100dvh-32px))] w-full max-w-lg overflow-y-auto rounded-2xl p-5 shadow-2xl" onClick={(event)=>event.stopPropagation()}>
      <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--primary)]">İstanbulkart</p><h2 id="fare-catalog-title" className="mt-1 text-lg font-extrabold">Tarifeler</h2><p className="mt-1 text-[11px] text-[var(--muted)]">{catalog ? `${formatSourceDate(catalog.effectiveFrom)} itibarıyla` : 'Tarife verisi yükleniyor'}</p></div><button type="button" aria-label="Tarifeler penceresini kapat" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"><X className="h-4 w-4" /></button></div>
      {generalFare&&<><div className="mt-5"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-extrabold">Genel İstanbulkart</h3>{source&&<a href={source.url} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-[var(--primary)] underline underline-offset-2">Resmî kaynak</a>}</div><p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">İETT’de tek biletli, metro entegre ve genel ilk biniş sınıfına giren hatlar için başlangıç ücretleri.</p><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{prices.map(([label,key])=><div key={key} className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-2.5"><span className="flex items-center gap-1 text-[10px] font-medium text-[var(--muted)]">{label}{PRICE_CATEGORY_HELP[key]&&<span title={PRICE_CATEGORY_HELP[key]} aria-label={`${label} açıklaması`} className="cursor-help text-[var(--primary)]"><Info className="h-3 w-3" /></span>}</span><strong className="mt-1 block text-base">{formatFare(generalFare.pricesKurus?.[key])}</strong></div>)}</div></div>
      <div className="mt-5 border-t border-[var(--border)] pt-4"><h3 className="text-sm font-extrabold">Aylık abonman</h3><p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">Mavi Kart aylık abonman seçenekleri; geçiş sayısı her kart türü için resmî tarifedeki limitidir.</p><div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">{catalog?.monthlyPasses?.map((pass)=><div key={pass.label} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-muted)] px-2.5 py-2 text-[11px]"><span><span className="block font-semibold">{pass.label}</span><span className="text-[10px] text-[var(--muted)]">{pass.passCount} geçiş / ay</span></span><strong>{formatFare(pass.priceKurus)}</strong></div>)}</div><p className="mt-2 text-[10px] leading-relaxed text-[var(--muted)]">Hak sahipliği, kart başvurusu ve hatlardaki kullanım limitleri İstanbulkart kurallarına göre değişebilir.</p></div>
      <div className="mt-5 border-t border-[var(--border)] pt-4"><h3 className="text-sm font-extrabold">Sınırlı geçiş biletleri</h3><p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">Fiziksel, SMS, QR ve web QR dahil sınırlı kullanımlı elektronik bilet tarifesi.</p><div className="mt-3 grid grid-cols-2 gap-1.5">{catalog?.limitedUseTickets?.map((ticket)=><div key={ticket.passCount} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-muted)] px-2.5 py-2 text-[11px]"><span className="font-semibold">{ticket.label}</span><strong>{formatFare(ticket.priceKurus)}</strong></div>)}</div></div>
      <div className="mt-5 border-t border-[var(--border)] pt-4"><h3 className="text-sm font-extrabold">Hatlara göre ücret</h3><p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">Metrobüs, Marmaray, M11, kademeli İETT ve bazı vapur hatlarında ücret mesafe, iskele veya tarife değişim noktasına bağlıdır. Bu nedenle kesin tutarı ilgili hattın “Tarifeyi gör” ayrıntısında kontrol edin.</p><div className="mt-3 flex flex-wrap gap-1.5">{['Metrobüs: mesafe bazlı','Marmaray ve M11: iade cihazı','Kademeli İETT','Vapur: iskeleye göre'].map((item)=><span key={item} className="rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--primary)]">{item}</span>)}</div></div>
      <div className="mt-5 rounded-xl border border-[var(--primary)]/20 bg-[var(--primary-soft)] p-3 text-[11px] leading-relaxed text-[var(--muted)]">Tarife verisi uygulama içinde statik sunulur; uygulama açıldığında dış tarife kaynağına istek gönderilmez. Aktarma, mesafe, iade ve saat kuralları nedeniyle bu ekran kesin yolculuk ücreti hesaplayıcısı değildir.</div></>}
    </section>
  </div>;
}

function RouteResult({ route,selected,favorite,onSelect }: { route:TransitRouteSummary; selected:boolean; favorite:boolean; onSelect:(route:TransitRouteSummary)=>void }) {
  return <button onClick={()=>onSelect(route)} className={cn('flex w-full items-center gap-3 rounded-xl p-3 text-left transition hover:bg-[var(--surface-muted)]',selected&&'bg-[var(--primary-soft)]')}>
    <span className="grid h-11 min-w-14 place-items-center rounded-xl text-sm font-black text-white" style={{background:route.color}}>{route.code}</span>
    <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="block truncate text-sm font-bold">{route.name}</span>{favorite&&<Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" />}</span><span className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">{route.mode==='Otobüs'?<BusFront className="h-3.5 w-3.5" />:<TramFront className="h-3.5 w-3.5" />}{route.mode} · {route.mode==='Otobüs'||route.mode==='Metrobüs'?(route.vehicleCount ? `${route.vehicleCount} araç` : 'Kaynaklı güzergâh'):`${route.stopCount} ${stopKind(route.mode)}`}</span></span>
    <ChevronRight className="h-4 w-4 text-[var(--muted)]" />
  </button>;
}

function StopResult({ stop,onSelect }: { stop:TransitStopSummary; onSelect:(stop:TransitStopSummary)=>void }) {
  const routeCount = new Set(stop.routes.map(([routeCode]) => routeCode)).size;
  return <button onClick={()=>onSelect(stop)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition hover:bg-[var(--surface-muted)]">
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]"><MapPin className="h-5 w-5" /></span>
    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{stop.name}</span><span className="mt-1 block truncate text-xs text-[var(--muted)]">{stop.district} · {routeCount} hat</span></span>
    <ChevronRight className="h-4 w-4 text-[var(--muted)]" />
  </button>;
}

function RecentResult({ item,onRoute,onStop,routes,stops }: { item:RecentTransitItem; onRoute:(route:TransitRouteSummary)=>void; onStop:(stop:TransitStopSummary)=>void; routes:TransitRouteSummary[]; stops:Map<string,TransitStopSummary> }) {
  if (item.kind === 'route') {
    const route = routes.find((candidate) => candidate.id === item.id);
    return route ? <RouteResult route={route} selected={false} favorite={false} onSelect={onRoute} /> : null;
  }
  const stop = stops.get(item.id);
  return stop ? <StopResult stop={stop} onSelect={onStop} /> : null;
}

function NearbyStopResult({ stop,distance,onSelect }: { stop:TransitStopSummary; distance:number; onSelect:(stop:TransitStopSummary)=>void }) {
  const routeCount = new Set(stop.routes.map(([routeCode]) => routeCode)).size;
  return <button onClick={()=>onSelect(stop)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition hover:bg-[var(--surface-muted)]">
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]"><MapPin className="h-5 w-5" /></span>
    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{stop.name}</span><span className="mt-1 block truncate text-xs text-[var(--muted)]">{stop.district} · {routeCount} hat</span></span>
    <span className="text-right"><span className="block text-xs font-extrabold text-[var(--primary)]">{formatDistance(distance)}</span><ChevronRight className="ml-auto mt-1 h-3.5 w-3.5 text-[var(--muted)]" /></span>
  </button>;
}

function NearbyStatus({ title,description,onRetry }: { title:string; description:string; onRetry:()=>void }) {
  return <div className="px-5 py-9 text-center"><LocateFixed className="mx-auto h-6 w-6 text-[var(--muted)]" /><p className="mt-3 text-sm font-bold">{title}</p><p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{description}</p><Button variant="ghost" size="sm" className="mt-3" onClick={onRetry}>Tekrar dene</Button></div>;
}
