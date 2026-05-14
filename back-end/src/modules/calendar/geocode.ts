import { GeocodeModel } from './geocode.model.js';

export interface LatLng {
  lat: number;
  lng: number;
}

const ONLINE_HINTS = /\b(zoom|meet|teams|hangout|google meet|webex|online|וירטואלי|מקוון)\b/i;

function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isVirtualLocation(loc: string | null | undefined): boolean {
  if (!loc) return true;
  if (ONLINE_HINTS.test(loc)) return true;
  if (/^https?:\/\//i.test(loc.trim())) return true;
  return false;
}

export async function geocode(address: string): Promise<LatLng | null> {
  if (isVirtualLocation(address)) return null;
  const key = normalize(address);
  if (!key) return null;

  const cached = await GeocodeModel.findOne({ key }).lean();
  if (cached) {
    if (!cached.resolved || cached.lat == null || cached.lng == null) return null;
    return { lat: cached.lat, lng: cached.lng };
  }

  let result: LatLng | null = null;
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', address);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'shared-calendar/0.1 (oss)',
        'Accept-Language': 'he,en',
      },
    });
    if (res.ok) {
      const json = (await res.json()) as Array<{ lat: string; lon: string }>;
      const hit = json[0];
      if (hit) {
        const lat = parseFloat(hit.lat);
        const lng = parseFloat(hit.lon);
        if (!isNaN(lat) && !isNaN(lng)) result = { lat, lng };
      }
    }
  } catch {
    // network failure — cache as unresolved
  }

  await GeocodeModel.findOneAndUpdate(
    { key },
    {
      $set: {
        query: address,
        lat: result?.lat ?? null,
        lng: result?.lng ?? null,
        resolved: result !== null,
      },
    },
    { upsert: true, new: true },
  );

  return result;
}
