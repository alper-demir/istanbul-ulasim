'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { useTheme } from 'next-themes';
import {
  BusFront, ChevronRight, Clock3, Layers3, LocateFixed, MapPin, Moon,
  Navigation2, Search, Star, Sun, TramFront, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { routes as fixtureRoutes, type TransitRoute, type TransitVehicle } from '@/lib/transit-fixtures';
import { cn } from '@/lib/utils';

const ROUTE_SOURCE = 'selected-route';
const STOP_SOURCE = 'selected-stops';
const VEHICLE_SOURCE = 'selected-vehicles';

function lineFeature(route: TransitRoute): FeatureCollection {
  return { type:'FeatureCollection', features:[{ type:'Feature', properties:{ color:route.color }, geometry:{ type:'LineString', coordinates:route.coordinates } }] };
}

function stopFeatures(route: TransitRoute): FeatureCollection {
  return { type:'FeatureCollection', features:route.stops.map((stop,index) => ({ type:'Feature', properties:{ ...stop, order:index+1 }, geometry:{ type:'Point', coordinates:stop.coordinates } })) };
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
  const [selectedRouteId, setSelectedRouteId] = useState(fixtureRoutes[0].id);
  const [selectedVehicle, setSelectedVehicle] = useState<TransitVehicle | null>(null);
  const [search, setSearch] = useState('');
  const [routeListOpen, setRouteListOpen] = useState(true);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const { resolvedTheme, setTheme } = useTheme();

  const routesQuery = useQuery({
    queryKey: ['routes'],
    queryFn: async (): Promise<{ data: TransitRoute[] }> => {
      const response = await fetch('/api/v1/routes');
      if (!response.ok) throw new Error('Hat verisi alınamadı');
      return response.json();
    },
    placeholderData: { data: fixtureRoutes },
    staleTime: 24 * 60 * 60 * 1000,
  });

  const routes = routesQuery.data?.data ?? fixtureRoutes;

  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? routes[0];
  const filteredRoutes = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('tr-TR');
    if (!normalized) return routes;
    return routes.filter((route) => `${route.code} ${route.name} ${route.mode}`.toLocaleLowerCase('tr-TR').includes(normalized));
  }, [routes, search]);

  useEffect(() => {
    const stored = window.localStorage.getItem('istanbulum:favorites');
    // Favorites are intentionally device-local for the MVP.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setFavorites(JSON.parse(stored));
  }, []);

  useEffect(() => {
    selectedRouteRef.current = selectedRoute;
  }, [selectedRoute]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const initialRoute = selectedRouteRef.current;
    const map = new maplibregl.Map({
      container:mapContainerRef.current,
      style:'https://tiles.openfreemap.org/styles/liberty',
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
      map.addLayer({ id:'route-stops', type:'circle', source:STOP_SOURCE, minzoom:10.4, paint:{
        'circle-radius':['interpolate',['linear'],['zoom'],10.4,4,14,7],
        'circle-color':'#ffffff', 'circle-stroke-color':initialRoute.color, 'circle-stroke-width':3,
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
      setMapReady(true);
      fitRoute(map, initialRoute);
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current=null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    (map.getSource(ROUTE_SOURCE) as GeoJSONSource)?.setData(lineFeature(selectedRoute));
    (map.getSource(STOP_SOURCE) as GeoJSONSource)?.setData(stopFeatures(selectedRoute));
    (map.getSource(VEHICLE_SOURCE) as GeoJSONSource)?.setData(vehicleFeatures(selectedRoute));
    map.setPaintProperty('route-stops','circle-stroke-color',selectedRoute.color);
    map.setPaintProperty('vehicle-glow','circle-color',selectedRoute.color);
    map.setPaintProperty('route-vehicles','circle-color',selectedRoute.color);
    setSelectedVehicle(null);
    fitRoute(map,selectedRoute);
  }, [mapReady,selectedRoute]);

  const selectRoute = (route: TransitRoute) => {
    setSelectedRouteId(route.id);
    setMobilePanelOpen(true);
    if (window.innerWidth < 768) setRouteListOpen(false);
  };

  const toggleFavorite = () => {
    const next = favorites.includes(selectedRoute.id) ? favorites.filter((id) => id !== selectedRoute.id) : [...favorites,selectedRoute.id];
    setFavorites(next);
    window.localStorage.setItem('istanbulum:favorites',JSON.stringify(next));
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
            <p className="text-[17px] font-bold leading-none tracking-tight">İstanbulum</p>
            <p className="mt-1 text-[10px] font-medium text-[var(--muted)]">Şehrin ulaşımı, tek haritada</p>
          </div>
        </div>
        <div className="relative mx-auto flex max-w-xl flex-1 items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--muted)]" />
          <input value={search} onChange={(e)=>{setSearch(e.target.value);setRouteListOpen(true);}} onFocus={()=>setRouteListOpen(true)} placeholder="Hat, durak veya otobüs ara" aria-label="Hat, durak veya otobüs ara" className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] pl-10 pr-10 text-sm font-medium outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-soft)]" />
          {search && <button onClick={()=>setSearch('')} aria-label="Aramayı temizle" className="absolute right-3 text-[var(--muted)]"><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex min-w-fit items-center justify-end gap-2 md:w-[272px]">
          <span className="hidden items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 md:flex"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />Demo canlı</span>
          <Button variant="secondary" size="icon" aria-label="Temayı değiştir" onClick={()=>setTheme(resolvedTheme==='dark'?'light':'dark')}>
            <Moon className="h-4 w-4 dark:hidden" />
            <Sun className="hidden h-4 w-4 dark:block" />
          </Button>
        </div>
      </header>

      {routeListOpen && (
        <section className="glass-panel absolute left-3 right-3 top-[84px] z-20 max-h-[52vh] overflow-hidden rounded-2xl md:left-5 md:right-auto md:top-[104px] md:w-[320px]" aria-label="Hat sonuçları">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Hatlar</p><p className="mt-0.5 text-sm font-semibold">{filteredRoutes.length} sonuç</p></div>
            <Button variant="ghost" size="icon" onClick={()=>setRouteListOpen(false)} aria-label="Hat listesini kapat"><X className="h-4 w-4" /></Button>
          </div>
          <div className="max-h-[42vh] space-y-1 overflow-y-auto p-2">
            {filteredRoutes.map((route)=>(
              <button key={route.id} onClick={()=>selectRoute(route)} className={cn('flex w-full items-center gap-3 rounded-xl p-3 text-left transition hover:bg-[var(--surface-muted)]',selectedRoute.id===route.id&&'bg-[var(--primary-soft)]')}>
                <span className="grid h-11 min-w-14 place-items-center rounded-xl text-sm font-black text-white" style={{background:route.color}}>{route.code}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{route.name}</span><span className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">{route.mode==='Metrobüs'?<TramFront className="h-3.5 w-3.5" />:<BusFront className="h-3.5 w-3.5" />}{route.mode} · {route.vehicles.length} araç</span></span>
                <ChevronRight className="h-4 w-4 text-[var(--muted)]" />
              </button>
            ))}
          </div>
        </section>
      )}

      {!routeListOpen && <Button className="absolute left-5 top-[104px] z-20 hidden shadow-lg md:inline-flex" onClick={()=>setRouteListOpen(true)}><BusFront className="h-4 w-4" />Hatları göster</Button>}

      <aside className={cn('glass-panel absolute bottom-3 left-3 right-3 z-20 max-h-[58vh] overflow-y-auto rounded-2xl transition-transform md:bottom-auto md:left-auto md:right-5 md:top-[104px] md:max-h-[calc(100vh-128px)] md:w-[350px]',!mobilePanelOpen&&'translate-y-[calc(100%+24px)] md:translate-y-0')}>
        <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-4 backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <div className="grid h-12 min-w-16 place-items-center rounded-xl text-base font-black text-white" style={{background:selectedRoute.color}}>{selectedRoute.code}</div>
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">{selectedRoute.mode}</span><span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />canlı</span></div><h1 className="mt-1.5 text-base font-extrabold leading-tight">{selectedRoute.name}</h1></div>
            <Button variant="ghost" size="icon" onClick={toggleFavorite} aria-label="Hattı favorile"><Star className={cn('h-4 w-4',favorites.includes(selectedRoute.id)&&'fill-amber-400 text-amber-500')} /></Button>
            <Button variant="ghost" size="icon" className="md:hidden" onClick={()=>setMobilePanelOpen(false)} aria-label="Detayı kapat"><X className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-3 gap-2"><Metric icon={<BusFront />} value={String(selectedRoute.vehicles.length)} label="aktif araç" /><Metric icon={<MapPin />} value={String(selectedRoute.stops.length)} label="örnek durak" /><Metric icon={<Clock3 />} value={`${selectedRoute.durationMinutes} dk`} label="tek yön" /></div>
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Ücret tarifesi</p><p className="mt-1 text-sm font-bold">{selectedRoute.fareLabel}</p></div><span className="rounded-lg bg-[var(--surface-strong)] px-2.5 py-1.5 text-xs font-semibold text-[var(--muted)]">Demo veri</span></div></div>
          <div className="mt-5 flex items-center justify-between"><h2 className="text-sm font-extrabold">Hat üzerindeki araçlar</h2><span className="text-xs font-medium text-[var(--muted)]">30 sn’de yenilenir</span></div>
          <div className="mt-2 space-y-2">
            {selectedRoute.vehicles.map((vehicle)=>(
              <button key={vehicle.id} onClick={()=>setSelectedVehicle(vehicle)} className={cn('flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3 text-left transition hover:border-[var(--primary)]',selectedVehicle?.id===vehicle.id&&'border-[var(--primary)] ring-2 ring-[var(--primary-soft)]')}>
                <span className="grid h-9 w-9 place-items-center rounded-lg text-white" style={{background:selectedRoute.color}}><BusFront className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{vehicle.doorCode}</span><span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{vehicle.direction} · {vehicle.nextStop}</span></span>
                <span className="text-right text-xs"><span className="block font-bold">{vehicle.speed} km/sa</span><span className="text-[var(--muted)]">{vehicle.updatedSecondsAgo} sn önce</span></span>
              </button>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between"><h2 className="text-sm font-extrabold">Güzergâh durakları</h2><span className="text-xs font-medium text-[var(--muted)]">Yakınlaşınca haritada</span></div>
          <div className="relative mt-3 space-y-0 pl-1">
            {selectedRoute.stops.map((stop,index)=>(
              <div key={stop.id} className="relative flex min-h-14 gap-3 pb-3">{index<selectedRoute.stops.length-1&&<span className="absolute left-[7px] top-4 h-full w-0.5 bg-[var(--border)]" />}<span className="relative z-10 mt-1.5 h-4 w-4 rounded-full border-[3px] bg-[var(--surface-strong)]" style={{borderColor:selectedRoute.color}} /><div><p className="text-sm font-semibold">{stop.name}</p><p className="mt-0.5 text-xs text-[var(--muted)]">{stop.district}</p></div></div>
            ))}
          </div>
        </div>
      </aside>

      {selectedVehicle&&<div className="glass-panel absolute bottom-5 left-1/2 z-30 w-[min(420px,calc(100%-24px))] -translate-x-1/2 rounded-2xl p-4 md:left-[calc(50%-10px)]"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl text-white" style={{background:selectedRoute.color}}><BusFront className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="font-extrabold">{selectedVehicle.doorCode}</p><span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-300">CANLI</span></div><p className="mt-0.5 truncate text-xs text-[var(--muted)]">{selectedVehicle.direction} yönü · Sıradaki {selectedVehicle.nextStop}</p></div><div className="text-right"><p className="text-sm font-extrabold">{selectedVehicle.speed} km/sa</p><p className="text-[10px] text-[var(--muted)]">{selectedVehicle.updatedSecondsAgo} sn önce</p></div><Button variant="ghost" size="icon" onClick={()=>setSelectedVehicle(null)} aria-label="Araç kartını kapat"><X className="h-4 w-4" /></Button></div></div>}

      <div className="absolute bottom-5 left-5 z-10 hidden items-center gap-2 md:flex"><Button variant="secondary" size="sm"><Layers3 className="h-3.5 w-3.5" />Katmanlar</Button><Button variant="secondary" size="icon" aria-label="Konumuma git"><LocateFixed className="h-4 w-4" /></Button></div>
      {!mobilePanelOpen&&<Button className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 shadow-xl md:hidden" onClick={()=>setMobilePanelOpen(true)}><BusFront className="h-4 w-4" />{selectedRoute.code} detayları</Button>}
    </main>
  );
}

function Metric({ icon,value,label }: { icon:React.ReactNode; value:string; label:string }) {
  return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3"><div className="mb-2 h-4 w-4 text-[var(--primary)] [&>svg]:h-4 [&>svg]:w-4">{icon}</div><p className="text-sm font-extrabold">{value}</p><p className="mt-0.5 text-[10px] font-medium text-[var(--muted)]">{label}</p></div>;
}
