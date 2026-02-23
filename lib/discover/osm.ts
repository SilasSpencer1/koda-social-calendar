/**
 * OpenStreetMap clients: Overpass (venues) + Nominatim (geocoding).
 *
 * Uses the public Overpass API and Nominatim API.
 * Requires OSM_USER_AGENT env var (Nominatim usage policy).
 */

import { cacheGet, cacheSet } from './cache';
import { isOpenAtTime } from './hours';
import type { SuggestionDTO, DiscoverQuery } from './types';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const CACHE_TTL = 2 * 60 * 60; // 2 hours

/**
 * Map user-facing interest names to OSM amenity/leisure tags.
 */
const INTEREST_TO_OSM: Record<string, string[]> = {
  cafe: ['amenity=cafe'],
  coffee: ['amenity=cafe'],
  restaurant: ['amenity=restaurant'],
  food: ['amenity=restaurant', 'amenity=fast_food'],
  bar: ['amenity=bar', 'amenity=pub'],
  nightlife: ['amenity=bar', 'amenity=pub', 'amenity=nightclub'],
  music: ['amenity=nightclub', 'leisure=music_venue'],
  park: ['leisure=park'],
  outdoors: ['leisure=park', 'leisure=garden'],
  museum: ['tourism=museum'],
  art: ['tourism=museum', 'tourism=gallery'],
  cinema: ['amenity=cinema'],
  theatre: ['amenity=theatre'],
  gym: ['leisure=fitness_centre'],
  sports: ['leisure=sports_centre', 'leisure=stadium'],
  shopping: ['shop=mall', 'shop=department_store'],
};

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

/**
 * Geocode a city name to lat/lng using Nominatim.
 */
async function geocodeCity(
  city: string
): Promise<{ lat: number; lng: number } | null> {
  const cacheKey = `nominatim:${city.toLowerCase()}`;
  const cached = await cacheGet<{ lat: number; lng: number }>(cacheKey);
  if (cached) return cached;

  const userAgent = process.env.OSM_USER_AGENT;
  if (!userAgent) {
    console.warn('[Nominatim] OSM_USER_AGENT not set, skipping geocoding');
    return null;
  }

  try {
    const params = new URLSearchParams({
      q: city,
      format: 'json',
      limit: '1',
    });

    const res = await fetch(`${NOMINATIM_URL}/search?${params.toString()}`, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as NominatimResult[];
    if (!data.length) return null;

    const result = {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
    };
    await cacheSet(cacheKey, result, CACHE_TTL);
    return result;
  } catch (error) {
    console.error('[Nominatim] Geocode error:', error);
    return null;
  }
}

/**
 * Convert miles to meters for Overpass around query.
 */
function milesToMeters(miles: number): number {
  return Math.round(miles * 1609.344);
}

/**
 * Fetch nearby places from Overpass for a set of OSM tags.
 */
async function fetchOverpass(
  lat: number,
  lng: number,
  radiusMeters: number,
  tags: string[]
): Promise<OverpassElement[]> {
  // Build union of node + way queries for each tag (venues can be either)
  const queries = tags.flatMap((tag) => {
    const [key, value] = tag.split('=');
    return [
      `node["${key}"="${value}"](around:${radiusMeters},${lat},${lng});`,
      `way["${key}"="${value}"](around:${radiusMeters},${lat},${lng});`,
    ];
  });

  const query = `[out:json][timeout:15];(${queries.join('')});out center 30;`;

  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`[Overpass] API error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    return (data?.elements ?? []) as OverpassElement[];
  } catch (error) {
    console.error('[Overpass] Fetch error:', error);
    return [];
  }
}

/**
 * Haversine distance in miles between two points.
 */
function haversineDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Fetch OSM places near a city matching user interests.
 * Returns normalized SuggestionDTO[].
 */
export async function fetchOsmPlaces(
  query: DiscoverQuery
): Promise<SuggestionDTO[]> {
  // Geocode city
  const location = await geocodeCity(query.city);
  if (!location) {
    console.warn(`[OSM] Could not geocode city: ${query.city}`);
    return [];
  }

  // Map interests to OSM tags
  const allTags = new Set<string>();
  for (const interest of query.interests) {
    const mapped = INTEREST_TO_OSM[interest.toLowerCase()];
    if (mapped) mapped.forEach((t) => allTags.add(t));
  }

  // If no interests matched, use defaults
  if (allTags.size === 0) {
    [
      'amenity=cafe',
      'amenity=restaurant',
      'amenity=bar',
      'leisure=park',
    ].forEach((t) => allTags.add(t));
  }

  const tags = Array.from(allTags);
  const cacheKey = `osm:${query.city.toLowerCase()}:${query.radiusMiles}:${tags.sort().join(',')}`;

  // Check cache for raw elements
  let elements: OverpassElement[];
  const cached = await cacheGet<OverpassElement[]>(cacheKey);
  if (cached) {
    elements = cached;
  } else {
    elements = await fetchOverpass(
      location.lat,
      location.lng,
      milesToMeters(query.radiusMiles),
      tags
    );
    if (elements.length > 0) {
      await cacheSet(cacheKey, elements, CACHE_TTL);
    }
  }

  // Normalize to SuggestionDTO
  return elements
    .filter((el) => el.tags?.name) // must have a name
    .slice(0, 30) // cap results
    .map((el) => normalizeOsmElement(el, location, query));
}

function normalizeOsmElement(
  el: OverpassElement,
  cityLocation: { lat: number; lng: number },
  query: DiscoverQuery
): SuggestionDTO {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  const tags = el.tags ?? {};

  const openStatus = isOpenAtTime(
    tags.opening_hours ?? null,
    query.slotStart,
    query.slotEnd
  );

  const distance =
    lat != null && lng != null
      ? haversineDistanceMiles(cityLocation.lat, cityLocation.lng, lat, lng)
      : undefined;

  // Build address from available tags
  const addressParts = [
    tags['addr:street']
      ? `${tags['addr:housenumber'] ?? ''} ${tags['addr:street']}`.trim()
      : null,
    tags['addr:city'],
    tags['addr:postcode'],
  ].filter(Boolean);

  // Determine category from tags
  const category =
    tags.amenity || tags.leisure || tags.tourism || tags.shop || 'place';

  return {
    source: 'OSM',
    title: tags.name!,
    description: tags.description || tags.cuisine || undefined,
    category,
    venueName: tags.name!,
    address: addressParts.length > 0 ? addressParts.join(', ') : undefined,
    lat,
    lng,
    url: tags.website || tags['contact:website'] || undefined,
    isOpenAtTime: openStatus,
    confidence: openStatus === 'UNKNOWN' ? 'LOW' : 'HIGH',
    externalId: `osm-${el.type}-${el.id}`,
    rawPayload: el,
    distanceMiles: distance ? Math.round(distance * 10) / 10 : undefined,
    slotStartAt: query.slotStart.toISOString(),
    slotEndAt: query.slotEnd.toISOString(),
  };
}
