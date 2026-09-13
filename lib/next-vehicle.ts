export type VehicleStopRelation = 'approaching' | 'near' | 'passed' | 'unknown';

export function classifyVehicleStopRelation({
  nearSelectedStop,
  remainingMeters,
}: {
  nearSelectedStop: boolean;
  remainingMeters: number | null;
}): VehicleStopRelation {
  if (remainingMeters === null || !Number.isFinite(remainingMeters)) return 'unknown';
  if (nearSelectedStop) return 'near';
  if (remainingMeters < -200) return 'passed';
  if (remainingMeters <= 250) return 'near';
  return 'approaching';
}

export function vehicleStopRelationLabel(relation: VehicleStopRelation) {
  if (relation === 'near') return 'Durağa çok yakın';
  if (relation === 'passed') return 'Durağı geçmiş olabilir';
  if (relation === 'unknown') return 'Konum doğrulanamadı';
  return 'Durağa yaklaşıyor';
}
