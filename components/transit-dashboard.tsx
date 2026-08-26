'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { useTheme } from 'next-themes';
import {
  BusFront, Check, ChevronRight, Clock3, LocateFixed, MapPin, Moon,
  Navigation2, Route as RouteIcon, Search, Share2, Star, Sun, TramFront, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { routes as fixtureRoutes, type TransitRoute, type TransitStop, type TransitVehicle } from '@/lib/transit-fixtures';
import type { TransitRouteSummary } from '@/lib/data-sources/iett-route-store';
import type { TransitStopOccurrence, TransitStopSummary } from '@/lib/transit-search';
import { APP_VERSION } from '@/lib/app-version';
import { cn } from '@/lib/utils';

const ROUTE_SOURCE = 'selected-route';
const STOP_SOURCE = 'selected-stops';
const VEHICLE_SOURCE = 'selected-vehicles';
const TRANSIT_DATA_VERSION = '2026-08-26.6';
const STOP_RADIUS: maplibregl.ExpressionSpecification = ['case', ['get', 'selected'], 12, 7];

function readRouteStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const route = params.get('route')?.trim();
  return {
    routeId: route ? (route.startsWith('iett:') ? route : `iett:${route}`) : 'iett:500T',
    directionId: params.get('direction') === 'return' ? 'return' : 'outbound',
  };
}

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/\p{Diacritic}/gu, '').replaceAll('ı', 'i');
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

function stopFeatures(route: TransitRoute, selectedStopId?: string): FeatureCollection {
  return { type:'FeatureCollection', features:route.stops.map((stop,index) => ({ type:'Feature', properties:{ ...stop, order:index+1, selected:stop.id === selectedStopId }, geometry:{ type:'Point', coordinates:stop.coordinates } })) };
}

function vehicleFeatures(route: TransitRoute): FeatureCollection {
  return { type:'FeatureCollection', features:route.vehicles.map((vehicle) => ({ type:'Feature', properties:{ ...vehicle }, geometry:{ type:'Point', coordinates:vehicle.coordinates } })) };
}

function fitRoute(map: MapLibreMap, route: TransitRoute) {
  const bounds = route.coordinates.reduce(
    (result, coordinate) => result.extend(coordinate),
    new maplibregl.LngLatBounds(route.coordinates[0], route.coordinates[0]),
  );
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
  const selectedRouteRef = useRef(fixtureRoutes[0]);
  const [selectedRouteId, setSelectedRouteId] = useState('iett:500T');
  const [selectedDirectionId, setSelectedDirectionId] = useState('outbound');
  const [selectedVehicle, setSelectedVehicle] = useState<TransitVehicle | null>(null);
  const [selectedStop, setSelectedStop] = useState<TransitStop | null>(null);
  const [pendingStop, setPendingStop] = useState<{ stopId:string; routeId:string; directionId:string } | null>(null);
  const [search, setSearch] = useState('');
  const [routeListOpen, setRouteListOpen] = useState(true);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [urlStateReady, setUrlStateReady] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  const routesQuery = useQuery({
    queryKey: ['routes', TRANSIT_DATA_VERSION],
    queryFn: async (): Promise<{ data: TransitRouteSummary[] }> => {
      const response = await fetch(`/iett/route-index.json?v=${TRANSIT_DATA_VERSION}`);
      if (!response.ok) throw new Error('Hat verisi alınamadı');
      return response.json();
    },
    placeholderData: { data: fixtureRoutes.map(({ stops, vehicles, ...route }) => ({ ...route, vehicleCount: vehicles.length, stopCount: stops.length })) },
    staleTime: 24 * 60 * 60 * 1000,
  });

  const routes = routesQuery.data?.data ?? fixtureRoutes.map(({ stops, vehicles, ...route }) => ({ ...route, vehicleCount: vehicles.length, stopCount: stops.length }));
  const normalizedSearch = normalizeSearch(search.trim());
  const stopIndexQuery = useQuery({
    queryKey: ['stops', TRANSIT_DATA_VERSION],
    queryFn: async (): Promise<{ data: TransitStopSummary[] }> => {
      const response = await fetch(`/iett/stop-index.json?v=${TRANSIT_DATA_VERSION}`);
      if (!response.ok) throw new Error('Durak verisi alınamadı');
      return response.json();
    },
    enabled: normalizedSearch.length >= 2 || Boolean(selectedStop),
    staleTime: 24 * 60 * 60 * 1000,
  });
  const routeQuery = useQuery({
    queryKey: ['route', TRANSIT_DATA_VERSION, selectedRouteId],
    queryFn: async (): Promise<{ data: TransitRoute }> => {
      const response = selectedRouteId.startsWith('iett:')
        ? await fetch(`/iett/routes/${encodeURIComponent(selectedRouteId.replace('iett:', ''))}.json?v=${TRANSIT_DATA_VERSION}`)
        : await fetch(`/api/v1/routes/${encodeURIComponent(selectedRouteId)}`);
      if (!response.ok) throw new Error('Hat detayı alınamadı');
      return response.json();
    },
    placeholderData: (previousData) => previousData,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const routeData = routeQuery.data?.data ?? fixtureRoutes[0];
  const selectedDirection = routeData.directions?.find((direction) => direction.id === selectedDirectionId) ?? routeData.directions?.[0];
  const selectedRoute = useMemo(() => selectedDirection ? {
    ...routeData,
    coordinates:selectedDirection.coordinates,
    stops:selectedDirection.stops,
    durationMinutes:selectedDirection.durationMinutes,
  } : routeData, [routeData, selectedDirection]);
  const selectedStopIndex = selectedStop ? selectedRoute.stops.findIndex((stop) => stop.id === selectedStop.id) : -1;
  const activeRoute = routeQuery.data?.data;
  const isOfficialRoute = selectedRoute.id.startsWith('iett:');
  const filteredRoutes = useMemo(() => {
    if (!normalizedSearch) return routes;
    return routes.filter((route) => normalizeSearch(`${route.code} ${route.name}`).includes(normalizedSearch));
  }, [normalizedSearch, routes]);
  const filteredStops = useMemo(() => {
    if (normalizedSearch.length < 2) return [];
    return (stopIndexQuery.data?.data ?? []).filter((stop) => normalizeSearch(`${stop.name} ${stop.district}`).includes(normalizedSearch));
  }, [normalizedSearch, stopIndexQuery.data?.data]);
  const routeByCode = useMemo(() => new Map(routes.map((route) => [route.code, route])), [routes]);
  const stopById = useMemo(() => new Map((stopIndexQuery.data?.data ?? []).map((stop) => [stop.id, stop])), [stopIndexQuery.data?.data]);
  const selectedStopSummary = selectedStop ? stopById.get(selectedStop.id) : undefined;
  const selectedStopOccurrences = useMemo(() => (selectedStopSummary?.routes ?? [])
    .map((occurrence) => ({ occurrence, route:routeByCode.get(occurrence[0]) }))
    .filter((item): item is { occurrence:TransitStopOccurrence; route:TransitRouteSummary } => Boolean(item.route)),
  [routeByCode, selectedStopSummary]);
  const favoriteRoutes = useMemo(() => routes.filter((route) => favorites.includes(route.id)), [favorites, routes]);
  const regularRoutes = useMemo(
    () => search.trim() ? filteredRoutes : filteredRoutes.filter((route) => !favorites.includes(route.id)),
    [favorites, filteredRoutes, search],
  );

  useEffect(() => {
    const stored = window.localStorage.getItem('istanbulum:favorites');
    // Favorites are intentionally device-local for the MVP.
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) setFavorites(parsed);
      } catch { /* Ignore malformed device-local state. */ }
    }
  }, []);

  useEffect(() => {
    const applyUrlState = () => {
      const next = readRouteStateFromUrl();
      setSelectedRouteId(next.routeId);
      setSelectedDirectionId(next.directionId);
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
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [selectedDirectionId, selectedRouteId, urlStateReady]);

  useEffect(() => {
    selectedRouteRef.current = selectedRoute;
  }, [selectedRoute]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || !activeRoute) return;
    const initialRoute = activeRoute;
    const map = new maplibregl.Map({
      container:mapContainerRef.current,
      style: ISTANBUL_BASEMAP_STYLE,
      center:[29.01,41.035], zoom:9.6, minZoom:8, maxZoom:18,
      attributionControl:false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact:true }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ showCompass:true }), 'bottom-right');
    map.on('load', () => {
      map.addSource(ROUTE_SOURCE, { type:'geojson', data:lineFeature(initialRoute) });
      map.addLayer({ id:'route-halo', type:'line', source:ROUTE_SOURCE, paint:{ 'line-color':'#ffffff', 'line-width':9, 'line-opacity':0.72 } });
      map.addLayer({ id:'route-line', type:'line', source:ROUTE_SOURCE, paint:{ 'line-color':['get','color'], 'line-width':5, 'line-opacity':0.96 } });
      map.addSource(STOP_SOURCE, { type:'geojson', data:stopFeatures(initialRoute) });
      map.addLayer({ id:'route-stops', type:'circle', source:STOP_SOURCE, paint:{
        'circle-radius':STOP_RADIUS,
        'circle-color':['case',['get','selected'],initialRoute.color,'#ffffff'], 'circle-stroke-color':['case',['get','selected'],'#ffffff',initialRoute.color], 'circle-stroke-width':['case',['get','selected'],4,3.5],
      } });
      map.addSource(VEHICLE_SOURCE, { type:'geojson', data:vehicleFeatures(initialRoute) });
      map.addLayer({ id:'vehicle-glow', type:'circle', source:VEHICLE_SOURCE, paint:{ 'circle-radius':18, 'circle-color':initialRoute.color, 'circle-opacity':0.18 } });
      map.addLayer({ id:'route-vehicles', type:'circle', source:VEHICLE_SOURCE, paint:{ 'circle-radius':9, 'circle-color':initialRoute.color, 'circle-stroke-color':'#ffffff', 'circle-stroke-width':3 } });
      map.on('mouseenter','route-vehicles',() => { map.getCanvas().style.cursor='pointer'; });
      map.on('mouseleave','route-vehicles',() => { map.getCanvas().style.cursor=''; });
      map.on('click','route-vehicles',(event: MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.id;
        const activeRoute = selectedRouteRef.current;
        setSelectedVehicle(activeRoute.vehicles.find((item) => item.id === id) ?? null);
      });
      map.on('mouseenter','route-stops',() => { map.getCanvas().style.cursor='pointer'; });
      map.on('mouseleave','route-stops',() => { map.getCanvas().style.cursor=''; });
      map.on('click','route-stops',(event: MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.id;
        const activeRoute = selectedRouteRef.current;
        setSelectedStop(activeRoute.stops.find((item) => item.id === id) ?? null);
      });
      setMapReady(true);
      fitRoute(map, initialRoute);
    });
    mapRef.current = map;
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
    if (!map || !mapReady || !activeRoute || !map.isStyleLoaded() || !map.getSource(ROUTE_SOURCE) || !map.getSource(STOP_SOURCE) || !map.getSource(VEHICLE_SOURCE)) return;
    (map.getSource(ROUTE_SOURCE) as GeoJSONSource).setData(lineFeature(selectedRoute));
    (map.getSource(STOP_SOURCE) as GeoJSONSource).setData(stopFeatures(selectedRoute));
    (map.getSource(VEHICLE_SOURCE) as GeoJSONSource).setData(vehicleFeatures(selectedRoute));
    if (map.getLayer('route-stops')) {
      map.setLayerZoomRange('route-stops', 0, 24);
      map.setLayoutProperty('route-stops','visibility','visible');
      map.setPaintProperty('route-stops','circle-radius',STOP_RADIUS);
      map.setPaintProperty('route-stops','circle-color',['case',['get','selected'],selectedRoute.color,'#ffffff']);
      map.setPaintProperty('route-stops','circle-stroke-color',['case',['get','selected'],'#ffffff',selectedRoute.color]);
      map.setPaintProperty('route-stops','circle-stroke-width',['case',['get','selected'],4,3.5]);
      map.moveLayer('route-stops');
    }
    if (map.getLayer('vehicle-glow')) map.setPaintProperty('vehicle-glow','circle-color',selectedRoute.color);
    if (map.getLayer('route-vehicles')) map.setPaintProperty('route-vehicles','circle-color',selectedRoute.color);
    setSelectedVehicle(null);
    setSelectedStop(null);
    fitRoute(map,selectedRoute);
  }, [activeRoute, mapReady, selectedRoute]);

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
    (map.getSource(STOP_SOURCE) as GeoJSONSource).setData(stopFeatures(selectedRoute, selectedStop?.id));
  }, [mapReady, selectedRoute, selectedStop?.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selectedStop) return;
    map.flyTo({ center:selectedStop.coordinates, zoom:Math.max(map.getZoom(), 14), duration:500 });
  }, [mapReady, selectedStop]);

  const selectRoute = (route: TransitRouteSummary) => {
    setSelectedDirectionId('outbound');
    setSelectedRouteId(route.id);
    setMobilePanelOpen(true);
    if (window.innerWidth < 768) setRouteListOpen(false);
  };

  const openStopOnRoute = (stopId: string, occurrence: TransitStopOccurrence) => {
    const [routeCode, directionId] = occurrence;
    const routeId = `iett:${routeCode}`;
    setPendingStop({ stopId,routeId,directionId });
    setSelectedDirectionId(directionId);
    setSelectedRouteId(routeId);
    setSelectedVehicle(null);
    setMobilePanelOpen(true);
    setRouteListOpen(false);
    setSearch('');
  };

  const selectStopResult = (stop: TransitStopSummary) => {
    const currentCode = selectedRouteId.replace(/^iett:/, '');
    const occurrence = stop.routes.find(([routeCode, directionId]) => routeCode === currentCode && directionId === selectedDirectionId)
      ?? stop.routes.find(([routeCode]) => routeCode === currentCode)
      ?? stop.routes[0];
    if (occurrence) openStopOnRoute(stop.id, occurrence);
  };

  const toggleFavorite = () => {
    const next = favorites.includes(selectedRoute.id) ? favorites.filter((id) => id !== selectedRoute.id) : [...favorites,selectedRoute.id];
    setFavorites(next);
    window.localStorage.setItem('istanbulum:favorites',JSON.stringify(next));
  };

  const copyRouteLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch { /* Clipboard access can be unavailable outside secure contexts. */ }
  };

  const focusRoute = () => {
    if (mapRef.current) fitRoute(mapRef.current, selectedRoute);
  };

  const focusStop = () => {
    if (mapRef.current && selectedStop) mapRef.current.flyTo({ center:selectedStop.coordinates, zoom:Math.max(mapRef.current.getZoom(),14), duration:500 });
  };

  const locateUser = () => {
    if (!mapRef.current || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      mapRef.current?.flyTo({ center:[coords.longitude,coords.latitude], zoom:14, duration:700 });
    });
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
          <input value={search} onChange={(e)=>{setSearch(e.target.value);setRouteListOpen(true);}} onFocus={()=>setRouteListOpen(true)} placeholder="Hat veya durak ara" aria-label="Hat veya durak ara" className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] pl-10 pr-10 text-sm font-medium outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-soft)]" />
          {search && <button onClick={()=>setSearch('')} aria-label="Aramayı temizle" className="absolute right-3 text-[var(--muted)]"><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex min-w-fit items-center justify-end gap-2 md:w-[272px]">
          <span className="hidden items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300 md:flex"><span className="h-2 w-2 rounded-full bg-amber-500" />{isOfficialRoute ? 'Resmî hat ağı' : 'Demo veri'}</span>
          <Button variant="secondary" size="icon" aria-label="Temayı değiştir" onClick={()=>setTheme(resolvedTheme==='dark'?'light':'dark')}>
            <Moon className="h-4 w-4 dark:hidden" />
            <Sun className="hidden h-4 w-4 dark:block" />
          </Button>
        </div>
      </header>

      {routeListOpen && (
        <section className="glass-panel absolute left-3 right-3 top-[84px] z-20 max-h-[52vh] overflow-hidden rounded-2xl md:left-5 md:right-auto md:top-[104px] md:w-[340px]" aria-label="Arama sonuçları">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{search.trim()?'Arama':'Hatlar'}</p><p className="mt-0.5 text-sm font-semibold">{search.trim()?`${filteredRoutes.length} hat · ${filteredStops.length} durak`:`${filteredRoutes.length} hat`}</p></div>
            <Button variant="ghost" size="icon" onClick={()=>setRouteListOpen(false)} aria-label="Arama sonuçlarını kapat"><X className="h-4 w-4" /></Button>
          </div>
          <div className="max-h-[42vh] space-y-1 overflow-y-auto p-2">
            {!search.trim() && favoriteRoutes.length>0&&<><p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Favoriler</p>{favoriteRoutes.map((route)=><RouteResult key={route.id} route={route} selected={selectedRoute.id===route.id} favorite onSelect={selectRoute} />)}{regularRoutes.length>0&&<p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Tüm hatlar</p>}</>}
            {search.trim()&&regularRoutes.length>0&&<p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Hatlar</p>}
            {regularRoutes.map((route)=><RouteResult key={route.id} route={route} selected={selectedRoute.id===route.id} favorite={favorites.includes(route.id)} onSelect={selectRoute} />)}
            {normalizedSearch.length>=2&&stopIndexQuery.isLoading&&<div className="px-4 py-5 text-center text-xs font-medium text-[var(--muted)]">Duraklar yükleniyor…</div>}
            {search.trim()&&filteredStops.length>0&&<><p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Duraklar</p>{filteredStops.slice(0,20).map((stop)=><StopResult key={stop.id} stop={stop} onSelect={selectStopResult} />)}{filteredStops.length>20&&<p className="px-3 py-2 text-center text-[10px] font-medium text-[var(--muted)]">İlk 20 durak gösteriliyor · Aramayı daraltın</p>}</>}
            {search.trim()&&!filteredRoutes.length&&!filteredStops.length&&!stopIndexQuery.isLoading&&<div className="px-5 py-10 text-center"><Search className="mx-auto h-6 w-6 text-[var(--muted)]" /><p className="mt-3 text-sm font-bold">Sonuç bulunamadı</p><p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{normalizedSearch.length<2?'Durak aramak için en az 2 karakter yazın.':'Hat kodunu, hat adını veya durak adını farklı yazarak tekrar deneyin.'}</p><Button variant="ghost" size="sm" className="mt-3" onClick={()=>setSearch('')}>Aramayı temizle</Button></div>}
          </div>
        </section>
      )}

      {!routeListOpen && <Button className="absolute left-5 top-[104px] z-20 hidden shadow-lg md:inline-flex" onClick={()=>setRouteListOpen(true)}><BusFront className="h-4 w-4" />Hatları göster</Button>}

      <aside className={cn('glass-panel absolute bottom-3 left-3 right-3 z-20 max-h-[58vh] overflow-y-auto rounded-2xl transition-transform md:bottom-auto md:left-auto md:right-5 md:top-[104px] md:max-h-[calc(100vh-128px)] md:w-[350px]',!mobilePanelOpen&&'translate-y-[calc(100%+24px)] md:translate-y-0')}>
        <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-4 backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <div className="grid h-12 min-w-16 place-items-center rounded-xl text-base font-black text-white" style={{background:selectedRoute.color}}>{selectedRoute.code}</div>
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">{selectedRoute.mode}</span><span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-300"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{isOfficialRoute ? 'statik' : 'demo'}</span></div><h1 className="mt-1.5 text-base font-extrabold leading-tight">{selectedRoute.name}</h1></div>
            <Button variant="ghost" size="icon" onClick={toggleFavorite} aria-label={favorites.includes(selectedRoute.id)?'Hattı favorilerden çıkar':'Hattı favorilere ekle'}><Star className={cn('h-4 w-4',favorites.includes(selectedRoute.id)&&'fill-amber-400 text-amber-500')} /></Button>
            <Button variant="ghost" size="icon" onClick={copyRouteLink} aria-label={linkCopied?'Hat bağlantısı kopyalandı':'Hat bağlantısını kopyala'}>{linkCopied?<Check className="h-4 w-4 text-emerald-500" />:<Share2 className="h-4 w-4" />}</Button>
            <Button variant="ghost" size="icon" className="md:hidden" onClick={()=>setMobilePanelOpen(false)} aria-label="Detayı kapat"><X className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="p-4">
          {routeData.directions && routeData.directions.length > 1 && <div className="mb-4"><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Güzergâh yönü</p><div className="grid grid-cols-2 gap-2">{routeData.directions.map((direction)=><button key={direction.id} type="button" aria-pressed={selectedDirection?.id===direction.id} onClick={()=>setSelectedDirectionId(direction.id)} className={cn('rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition',selectedDirection?.id===direction.id?'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]':'border-[var(--border)] bg-[var(--surface-muted)] hover:border-[var(--primary)]')}><span className="block line-clamp-2">{direction.name}</span></button>)}</div></div>}
          <div className="grid grid-cols-3 gap-2"><Metric icon={<BusFront />} value={String(selectedRoute.vehicles.length)} label="aktif araç" /><Metric icon={<MapPin />} value={String(selectedRoute.stops.length)} label="örnek durak" /><Metric icon={<Clock3 />} value={`${selectedRoute.durationMinutes} dk`} label="tek yön" /></div>
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Ücret tarifesi</p><p className="mt-1 text-sm font-bold">{selectedRoute.fareLabel}</p></div><span className="rounded-lg bg-[var(--surface-strong)] px-2.5 py-1.5 text-xs font-semibold text-[var(--muted)]">{isOfficialRoute ? 'Resmî geometri' : 'Demo veri'}</span></div></div>
          <div className="mt-5 flex items-center justify-between"><h2 className="text-sm font-extrabold">Hat üzerindeki araçlar</h2><span className="text-xs font-medium text-[var(--muted)]">{selectedRoute.vehicles.length?'30 sn’de yenilenir':'Canlı kaynak bekleniyor'}</span></div>
          <div className="mt-2 space-y-2">
            {!selectedRoute.vehicles.length&&<div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-4 py-5 text-center"><BusFront className="mx-auto h-5 w-5 text-[var(--muted)]" /><p className="mt-2 text-xs font-bold">Canlı araç verisi bağlı değil</p><p className="mt-1 text-[10px] leading-relaxed text-[var(--muted)]">Güzergâh ve durak verileri kullanılabilir.</p></div>}
            {selectedRoute.vehicles.map((vehicle)=>(
              <button key={vehicle.id} onClick={()=>setSelectedVehicle(vehicle)} className={cn('flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3 text-left transition hover:border-[var(--primary)]',selectedVehicle?.id===vehicle.id&&'border-[var(--primary)] ring-2 ring-[var(--primary-soft)]')}>
                <span className="grid h-9 w-9 place-items-center rounded-lg text-white" style={{background:selectedRoute.color}}><BusFront className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{vehicle.doorCode}</span><span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{vehicle.direction} · {vehicle.nextStop}</span></span>
                <span className="text-right text-xs"><span className="block font-bold">{vehicle.speed} km/sa</span><span className="text-[var(--muted)]">{vehicle.updatedSecondsAgo} sn önce</span></span>
              </button>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between"><h2 className="text-sm font-extrabold">Güzergâh durakları</h2><span className="text-xs font-medium text-[var(--muted)]">{selectedRoute.stops.length ? 'Haritada tıklanabilir' : 'Resmî durak verisi bekleniyor'}</span></div>
          <div className="relative mt-3 space-y-0 pl-1">
            {selectedRoute.stops.map((stop,index)=>(
              <button key={stop.id} onClick={()=>setSelectedStop(stop)} className={cn('relative flex min-h-14 w-full gap-3 rounded-xl pb-3 text-left transition',selectedStop?.id===stop.id&&'bg-[var(--primary-soft)] px-2')}><>{index<selectedRoute.stops.length-1&&<span className="absolute left-[7px] top-4 h-full w-0.5 bg-[var(--border)]" />}<span className="relative z-10 mt-1.5 h-4 w-4 rounded-full border-[3px] bg-[var(--surface-strong)] transition" style={{borderColor:selectedStop?.id===stop.id?'#ffffff':selectedRoute.color, background:selectedStop?.id===stop.id?selectedRoute.color:undefined}} /><span><span className="text-sm font-semibold">{stop.name}</span><span className="mt-0.5 block text-xs text-[var(--muted)]">{stop.district}</span></span></></button>
            ))}
          </div>
        </div>
      </aside>

      {selectedVehicle&&<div className="glass-panel absolute bottom-5 left-1/2 z-30 w-[min(420px,calc(100%-24px))] -translate-x-1/2 rounded-2xl p-4 md:left-[calc(50%-10px)]"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl text-white" style={{background:selectedRoute.color}}><BusFront className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="font-extrabold">{selectedVehicle.doorCode}</p><span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-300">DEMO</span></div><p className="mt-0.5 truncate text-xs text-[var(--muted)]">{selectedVehicle.direction} yönü · Sıradaki {selectedVehicle.nextStop}</p></div><div className="text-right"><p className="text-sm font-extrabold">{selectedVehicle.speed} km/sa</p><p className="text-[10px] text-[var(--muted)]">{selectedVehicle.updatedSecondsAgo} sn önce</p></div><Button variant="ghost" size="icon" onClick={()=>setSelectedVehicle(null)} aria-label="Araç kartını kapat"><X className="h-4 w-4" /></Button></div></div>}
      {selectedStop&&<div className="glass-panel absolute bottom-5 left-1/2 z-30 max-h-[70vh] w-[min(500px,calc(100%-24px))] -translate-x-1/2 overflow-y-auto rounded-2xl p-4 md:left-[calc(50%-10px)]"><div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{background:selectedRoute.color}}><MapPin className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="font-extrabold">{selectedStop.name}</p><p className="mt-0.5 text-xs text-[var(--muted)]">{selectedStop.district} · {selectedStopIndex+1}. durak / {selectedRoute.stops.length}</p><p className="mt-1 truncate text-[10px] font-medium text-[var(--muted)]">{selectedDirection?.name??selectedRoute.name}</p><p className="mt-1 font-mono text-[10px] text-[var(--muted)]">{selectedStop.coordinates[1].toFixed(5)}, {selectedStop.coordinates[0].toFixed(5)}</p></div><Button variant="ghost" size="icon" onClick={()=>setSelectedStop(null)} aria-label="Durak kartını kapat"><X className="h-4 w-4" /></Button></div>{stopIndexQuery.isLoading&&<p className="mt-3 text-center text-[10px] font-medium text-[var(--muted)]">Duraktan geçen hatlar yükleniyor…</p>}{selectedStopOccurrences.length>0&&<div className="mt-3 border-t border-[var(--border)] pt-3"><div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Bu duraktan geçen hatlar</p><span className="text-[10px] font-semibold text-[var(--muted)]">{new Set(selectedStopOccurrences.map(({route})=>route.id)).size} hat</span></div><div className="grid max-h-32 grid-cols-2 gap-2 overflow-y-auto pr-1">{selectedStopOccurrences.map(({occurrence,route})=><button key={`${occurrence[0]}-${occurrence[1]}`} onClick={()=>openStopOnRoute(selectedStop.id,occurrence)} className={cn('flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-2 text-left transition hover:border-[var(--primary)]',route.id===selectedRoute.id&&occurrence[1]===selectedDirectionId&&'border-[var(--primary)] bg-[var(--primary-soft)]')}><span className="grid h-7 min-w-10 place-items-center rounded-md text-[10px] font-black text-white" style={{background:route.color}}>{route.code}</span><span className="min-w-0"><span className="block truncate text-[10px] font-bold">{occurrence[1]==='return'?'Dönüş':'Gidiş'}</span><span className="block text-[9px] text-[var(--muted)]">{occurrence[2]}. durak</span></span></button>)}</div></div>}<Button variant="secondary" size="sm" className="mt-3 w-full" onClick={focusStop}><LocateFixed className="h-3.5 w-3.5" />Durağa odaklan</Button></div>}

      <div className="absolute bottom-5 left-5 z-10 hidden items-center gap-2 md:flex"><Button variant="secondary" size="sm" onClick={focusRoute}><RouteIcon className="h-3.5 w-3.5" />Güzergâhı göster</Button><Button variant="secondary" size="icon" onClick={locateUser} aria-label="Konumuma git"><LocateFixed className="h-4 w-4" /></Button></div>
      {!mobilePanelOpen&&<Button className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 shadow-xl md:hidden" onClick={()=>setMobilePanelOpen(true)}><BusFront className="h-4 w-4" />{selectedRoute.code} detayları</Button>}
    </main>
  );
}

function Metric({ icon,value,label }: { icon:React.ReactNode; value:string; label:string }) {
  return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3"><div className="mb-2 h-4 w-4 text-[var(--primary)] [&>svg]:h-4 [&>svg]:w-4">{icon}</div><p className="text-sm font-extrabold">{value}</p><p className="mt-0.5 text-[10px] font-medium text-[var(--muted)]">{label}</p></div>;
}

function RouteResult({ route,selected,favorite,onSelect }: { route:TransitRouteSummary; selected:boolean; favorite:boolean; onSelect:(route:TransitRouteSummary)=>void }) {
  return <button onClick={()=>onSelect(route)} className={cn('flex w-full items-center gap-3 rounded-xl p-3 text-left transition hover:bg-[var(--surface-muted)]',selected&&'bg-[var(--primary-soft)]')}>
    <span className="grid h-11 min-w-14 place-items-center rounded-xl text-sm font-black text-white" style={{background:route.color}}>{route.code}</span>
    <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="block truncate text-sm font-bold">{route.name}</span>{favorite&&<Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" />}</span><span className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">{route.mode==='Metrobüs'?<TramFront className="h-3.5 w-3.5" />:<BusFront className="h-3.5 w-3.5" />}{route.mode} · {route.vehicleCount ? `${route.vehicleCount} araç` : 'Resmî güzergâh'}</span></span>
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
