export type TransitStopOccurrence = [routeCode: string, directionId: string, stopOrder: number];

export type TransitStopSummary = {
  id: string;
  name: string;
  district: string;
  coordinates: [number, number];
  routes: TransitStopOccurrence[];
};
