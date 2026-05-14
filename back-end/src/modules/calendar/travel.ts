import type { LatLng } from './geocode.js';

const EARTH_RADIUS_KM = 6371;
const EFFECTIVE_SPEED_KMH = 50;
const FIXED_OVERHEAD_MINUTES = 10;

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return EARTH_RADIUS_KM * c;
}

export function estimateTravelMinutes(from: LatLng | null, to: LatLng | null): number {
  if (!from || !to) return 0;
  const km = haversineKm(from, to);
  if (km < 0.3) return 0;
  const travel = (km / EFFECTIVE_SPEED_KMH) * 60;
  return Math.ceil(travel + FIXED_OVERHEAD_MINUTES);
}
