export type GeoCoordinate = [number, number];

export const LIVE_VEHICLE_STALE_AFTER_SECONDS = 180;
const MAX_INTERPOLATED_JUMP_METERS = 2_500;
const MAX_ROUTE_OFFSET_METERS = 1_200;

export function distanceInMeters(from: GeoCoordinate, to: GeoCoordinate) {
  const earthRadius = 6_371_000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = toRadians(to[1] - from[1]);
  const longitudeDelta = toRadians(to[0] - from[0]);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(from[1])) * Math.cos(toRadians(to[1])) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function projectCoordinateOnRoute(point: GeoCoordinate, route: GeoCoordinate[]) {
  if (route.length < 2) return null;
  const longitudeScale = 111_320 * Math.cos(point[1] * Math.PI / 180);
  const latitudeScale = 110_540;
  let closestDistance = Number.POSITIVE_INFINITY;
  let closestCoordinate: GeoCoordinate | null = null;

  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index]!;
    const end = route[index + 1]!;
    const startX = (start[0] - point[0]) * longitudeScale;
    const startY = (start[1] - point[1]) * latitudeScale;
    const segmentX = (end[0] - start[0]) * longitudeScale;
    const segmentY = (end[1] - start[1]) * latitudeScale;
    const segmentSquared = segmentX ** 2 + segmentY ** 2;
    const progress = segmentSquared ? Math.max(0, Math.min(1, -(startX * segmentX + startY * segmentY) / segmentSquared)) : 0;
    const distance = Math.hypot(startX + segmentX * progress, startY + segmentY * progress);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestCoordinate = [start[0] + (end[0] - start[0]) * progress, start[1] + (end[1] - start[1]) * progress];
    }
  }

  return closestCoordinate ? { coordinate:closestCoordinate, distanceToRouteMeters:closestDistance } : null;
}

export function interpolateCoordinate(from: GeoCoordinate, to: GeoCoordinate, progress: number): GeoCoordinate {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  return [
    from[0] + (to[0] - from[0]) * clampedProgress,
    from[1] + (to[1] - from[1]) * clampedProgress,
  ];
}

type SafeMotionInput = {
  from:GeoCoordinate;
  to:GeoCoordinate;
  route:GeoCoordinate[];
  fromUpdatedSecondsAgo:number;
  toUpdatedSecondsAgo:number;
  progress:number;
};

// Live positions are source observations, not an ETA feed. Interpolation is
// deliberately conservative: it only draws a short, fresh movement on the
// selected route geometry and otherwise leaves the source point untouched.
export function safeInterpolatedCoordinate(input: SafeMotionInput): GeoCoordinate | null {
  if (input.fromUpdatedSecondsAgo > LIVE_VEHICLE_STALE_AFTER_SECONDS || input.toUpdatedSecondsAgo > LIVE_VEHICLE_STALE_AFTER_SECONDS) return null;
  if (distanceInMeters(input.from, input.to) > MAX_INTERPOLATED_JUMP_METERS) return null;
  const from = projectCoordinateOnRoute(input.from, input.route);
  const to = projectCoordinateOnRoute(input.to, input.route);
  if (!from || !to || from.distanceToRouteMeters > MAX_ROUTE_OFFSET_METERS || to.distanceToRouteMeters > MAX_ROUTE_OFFSET_METERS) return null;
  return interpolateCoordinate(from.coordinate, to.coordinate, input.progress);
}
