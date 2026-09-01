'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, ExternalLink, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { scheduleAvailability, type ScheduleDataset } from '@/lib/schedule-data';

type SchedulePanelProps = {
  dataset?: ScheduleDataset;
  selectedDirectionId: string;
  loading: boolean;
  error: boolean;
  unavailable: boolean;
  onRetry: () => void;
};

function formatDate(value?: string) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(Date.UTC(year!, month! - 1, day)));
}

const availabilityCopy = {
  valid: null,
  future: 'Bu tarife henüz yürürlükte değil.',
  expired: 'Bu tarifenin geçerlilik süresi dolmuş. Güncel saat için resmî kaynağı kontrol edin.',
  unknown: 'Kaynak geçerlilik aralığını açıkça belirtmiyor; alınma tarihini kontrol edin.',
} as const;

export function SchedulePanel({ dataset, selectedDirectionId, loading, error, unavailable, onRetry }: SchedulePanelProps) {
  const direction = dataset?.directions.find((item) => item.directionId === selectedDirectionId) ?? dataset?.directions[0];
  const selectionScope = `${dataset?.routeId ?? 'none'}:${direction?.directionId ?? 'none'}`;
  const [dayTypeSelection, setDayTypeSelection] = useState<{ scope:string; dayTypeId:string }>();
  const selectedDayTypeId = dayTypeSelection?.scope === selectionScope ? dayTypeSelection.dayTypeId : undefined;
  const activePattern = direction?.patterns.find((pattern) => pattern.dayTypeId === selectedDayTypeId) ?? direction?.patterns[0];
  const departures = useMemo(() => activePattern?.journeys.flatMap((journey) => journey.calls[0] ? [{ ...journey.calls[0], journeyId: journey.id }] : []) ?? [], [activePattern]);

  if (loading) return <div className="mt-3 rounded-lg border border-dashed border-[var(--border)] px-3 py-5 text-center"><CalendarClock className="mx-auto h-5 w-5 animate-pulse text-[var(--primary)]" /><p className="mt-2 text-xs font-bold">Planlı seferler yükleniyor</p></div>;
  if (error) return <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"><div className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><div><p className="text-xs font-bold">Sefer verisi yüklenemedi</p><p className="mt-1 text-[10px] leading-relaxed text-[var(--muted)]">Güzergâh ve diğer hat bilgileri kullanılmaya devam ediyor.</p></div></div><Button variant="ghost" size="sm" className="mt-2 w-full" onClick={onRetry}><RotateCw className="h-3.5 w-3.5" />Tekrar dene</Button></div>;
  if (unavailable || !dataset) return <div className="mt-3 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-strong)] px-3 py-4 text-center"><CalendarClock className="mx-auto h-5 w-5 text-[var(--muted)]" /><p className="mt-2 text-xs font-bold">Bu hat için sefer verisi hazırlanıyor</p><p className="mt-1 text-[10px] leading-relaxed text-[var(--muted)]">Planlı saatler doğrulandıktan sonra burada gösterilecek. Güzergâh verisi etkilenmez.</p></div>;

  const availability = scheduleAvailability(dataset.source);
  const warning = availabilityCopy[availability];
  const dayTypes = dataset.dayTypes.filter((dayType) => direction?.patterns.some((pattern) => pattern.dayTypeId === dayType.id));

  return <div className="mt-3 space-y-3">
    {warning&&<div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[10px] leading-relaxed text-amber-800 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{warning}</div>}
    {dayTypes.length>1&&<div><label htmlFor="schedule-day-type" className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--muted)]">Gün türü</label><select id="schedule-day-type" value={activePattern?.dayTypeId} onChange={(event)=>setDayTypeSelection({scope:selectionScope,dayTypeId:event.target.value})} className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-[var(--primary)]">{dayTypes.map((dayType)=><option key={dayType.id} value={dayType.id}>{dayType.label}</option>)}</select></div>}
    <div><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--muted)]">{direction?.name ?? 'Seçili yön'} · kalkış</p>{departures.length?<div className="mt-2 grid grid-cols-4 gap-1.5">{departures.slice(0,12).map((departure)=><span key={departure.journeyId} title={departure.marker ? `${departure.time} · ${departure.marker}` : departure.time} className="rounded-md bg-[var(--surface-strong)] px-1.5 py-1.5 text-center text-xs font-extrabold">{departure.time}{departure.marker&&<sup className="ml-0.5 text-[8px] text-[var(--primary)]">{departure.marker}</sup>}</span>)}</div>:<p className="mt-2 text-[10px] text-[var(--muted)]">Bu gün türü için yayımlanmış kalkış bulunamadı.</p>}{departures.length>12&&<p className="mt-1.5 text-[9px] text-[var(--muted)]">İlk 12 kalkış gösteriliyor · toplam {departures.length}</p>}</div>
    {activePattern?.notes.map((note)=><p key={note} className="text-[9px] leading-relaxed text-[var(--muted)]">{note}</p>)}
    <div className="border-t border-[var(--border)] pt-2 text-[9px] leading-relaxed text-[var(--muted)]"><div className="flex flex-wrap items-center justify-between gap-1"><a href={dataset.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[var(--primary)] underline underline-offset-2">{dataset.source.label}<ExternalLink className="h-2.5 w-2.5" /></a><span>Alındı: {formatDate(dataset.source.retrievedAt.slice(0,10))}</span></div>{dataset.source.effectiveFrom&&dataset.source.effectiveTo&&<p className="mt-1">Geçerlilik: {formatDate(dataset.source.effectiveFrom)} – {formatDate(dataset.source.effectiveTo)}</p>}<p className="mt-1">Planlı saatlerdir; gecikme, iptal ve özel gün değişikliği olabilir.</p></div>
  </div>;
}
