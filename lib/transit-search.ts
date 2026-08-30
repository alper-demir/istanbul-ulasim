/**
 * Older IETT build outputs use the route code in slot 0. New static networks
 * use a namespaced route id (for example `metro:M2`). Consumers accept both
 * formats so a data refresh never requires a coordinated client rollout.
 */
export type TransitStopOccurrence = [routeKey: string, directionId: string, stopOrder: number];

export type TransitStopSummary = {
  id: string;
  name: string;
  district: string;
  coordinates: [number, number];
  routes: TransitStopOccurrence[];
};
