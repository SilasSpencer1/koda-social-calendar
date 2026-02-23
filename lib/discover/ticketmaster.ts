/**
 * Ticketmaster Discovery API client.
 *
 * Docs: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
 * Requires TICKETMASTER_API_KEY env var.
 */

import { cacheGet, cacheSet } from './cache';
import type { SuggestionDTO, DiscoverQuery } from './types';

const TM_BASE = 'https://app.ticketmaster.com/discovery/v2';
const CACHE_TTL = 60 * 60; // 1 hour

interface TmEvent {
  id: string;
  name: string;
  url?: string;
  dates?: {
    start?: { dateTime?: string; localDate?: string };
    end?: { dateTime?: string };
  };
  classifications?: Array<{
    segment?: { name?: string };
    genre?: { name?: string };
  }>;
  _embedded?: {
    venues?: Array<{
      name?: string;
      address?: { line1?: string };
      city?: { name?: string };
      state?: { stateCode?: string };
      location?: { latitude?: string; longitude?: string };
    }>;
  };
  images?: Array<{ url?: string; width?: number }>;
  info?: string;
  pleaseNote?: string;
}

/**
 * Fetch events from Ticketmaster near a city for a time slot.
 * Returns normalized SuggestionDTO[].
 */
export async function fetchTicketmasterEvents(
  query: DiscoverQuery
): Promise<SuggestionDTO[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    console.warn('[Ticketmaster] TICKETMASTER_API_KEY not set, skipping');
    return [];
  }

  const slotStartIso = query.slotStart.toISOString();
  const slotEndIso = query.slotEnd.toISOString();
  const interestsHash = [...query.interests].sort().join(',');
  const cacheKey = `tm:${query.city}:${slotStartIso}:${slotEndIso}:${query.radiusMiles}:${interestsHash}`;

  // Check cache
  const cached = await cacheGet<TmEvent[]>(cacheKey);
  if (cached) {
    return cached.map((ev) => normalizeTmEvent(ev, query));
  }

  try {
    const params = new URLSearchParams({
      apikey: apiKey,
      city: query.city,
      radius: String(query.radiusMiles),
      unit: 'miles',
      startDateTime: query.slotStart.toISOString().replace('.000', ''),
      endDateTime: query.slotEnd.toISOString().replace('.000', ''),
      size: '20',
      sort: 'date,asc',
    });

    // Map interests to Ticketmaster classificationName
    if (query.interests.length > 0) {
      params.set('classificationName', query.interests.join(','));
    }

    const res = await fetch(`${TM_BASE}/events.json?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(`[Ticketmaster] API error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const events: TmEvent[] = data?._embedded?.events ?? [];

    // Cache raw events
    await cacheSet(cacheKey, events, CACHE_TTL);

    return events.map((ev) => normalizeTmEvent(ev, query));
  } catch (error) {
    console.error('[Ticketmaster] Fetch error:', error);
    return [];
  }
}

function normalizeTmEvent(ev: TmEvent, query: DiscoverQuery): SuggestionDTO {
  const venue = ev._embedded?.venues?.[0];
  const classification = ev.classifications?.[0];
  const image =
    ev.images?.find((img) => (img.width ?? 0) >= 300) ?? ev.images?.[0];

  return {
    source: 'TICKETMASTER',
    title: ev.name,
    description: ev.info || ev.pleaseNote || undefined,
    category:
      classification?.genre?.name || classification?.segment?.name || undefined,
    venueName: venue?.name || undefined,
    address: venue
      ? [venue.address?.line1, venue.city?.name, venue.state?.stateCode]
          .filter(Boolean)
          .join(', ')
      : undefined,
    lat: venue?.location?.latitude
      ? Number.isFinite(parseFloat(venue.location.latitude))
        ? parseFloat(venue.location.latitude)
        : undefined
      : undefined,
    lng: venue?.location?.longitude
      ? Number.isFinite(parseFloat(venue.location.longitude))
        ? parseFloat(venue.location.longitude)
        : undefined
      : undefined,
    url: ev.url || undefined,
    imageUrl: image?.url || undefined,
    // Ticketmaster events have known start times — treat as OPEN / HIGH confidence
    isOpenAtTime: 'OPEN',
    confidence: 'HIGH',
    externalId: `tm-${ev.id}`,
    rawPayload: ev,
    slotStartAt: query.slotStart.toISOString(),
    slotEndAt: query.slotEnd.toISOString(),
  };
}
