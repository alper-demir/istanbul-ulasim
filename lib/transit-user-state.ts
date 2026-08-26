export type RecentTransitItem = {
  kind: 'route' | 'stop';
  id: string;
  title: string;
  subtitle: string;
  routeId?: string;
  routeCode?: string;
  directionId?: string;
};

export type SavedManualLocation = {
  coordinates: [number, number];
  savedAt: string;
};

export const USER_STATE_KEYS = {
  favoriteRoutes: 'istanbulum:favorites',
  favoriteStops: 'istanbulum:favorite-stops',
  recents: 'istanbulum:recents',
  manualLocation: 'istanbulum:manual-location',
} as const;
