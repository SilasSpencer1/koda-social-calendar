import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { cacheGet, cacheSet } from '@/lib/discover/cache';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const CACHE_TTL = 24 * 60 * 60; // 24 hours

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
  country?: string;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  address: NominatimAddress;
}

interface CityResult {
  placeId: number;
  display: string;
  value: string;
}

function formatResult(item: NominatimResult): CityResult | null {
  const addr = item.address;
  const cityName = addr.city || addr.town || addr.village || addr.municipality;
  if (!cityName) return null;

  const parts = [cityName, addr.state, addr.country].filter(Boolean);
  const display = parts.join(', ');

  return { placeId: item.place_id, display, value: display };
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json([]);

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json([]);

  const cacheKey = `city-search:${q.toLowerCase()}`;
  const cached = await cacheGet<CityResult[]>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const userAgent = process.env.OSM_USER_AGENT;
  if (!userAgent) return NextResponse.json([]);

  try {
    const params = new URLSearchParams({
      q,
      format: 'json',
      addressdetails: '1',
      limit: '6',
      'accept-language': 'en',
    });

    const res = await fetch(`${NOMINATIM_URL}/search?${params}`, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return NextResponse.json([]);

    const data = (await res.json()) as NominatimResult[];

    const results: CityResult[] = [];
    const seen = new Set<string>();
    for (const item of data) {
      const formatted = formatResult(item);
      if (formatted && !seen.has(formatted.display)) {
        seen.add(formatted.display);
        results.push(formatted);
      }
    }

    await cacheSet(cacheKey, results, CACHE_TTL);
    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}
