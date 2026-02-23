import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limit';
import { fetchAndRankSuggestions } from '@/lib/discover/ranking';
import type { SuggestionDTO } from '@/lib/discover/types';

const SUGGESTIONS_RATE_LIMIT = {
  maxRequests: 30,
  windowMs: 60 * 1000, // 1 minute
  keyPrefix: 'suggestions',
};

const QuerySchema = z.object({
  slotStart: z.string().datetime(),
  slotEnd: z.string().datetime(),
});

/**
 * GET /api/suggestions?slotStart=ISO&slotEnd=ISO
 *
 * Fetch, rank, and persist suggestions for a given time slot.
 * Filters out CLOSED suggestions (when hours are known).
 * Returns a safe DTO without rawPayload.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Rate limit
    const rl = await checkRateLimit(userId, SUGGESTIONS_RATE_LIMIT);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests. Try again later.' },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(request.url);
    const parsed = QuerySchema.safeParse({
      slotStart: searchParams.get('slotStart'),
      slotEnd: searchParams.get('slotEnd'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Missing or invalid slotStart/slotEnd query params' },
        { status: 400 }
      );
    }

    const slotStart = new Date(parsed.data.slotStart);
    const slotEnd = new Date(parsed.data.slotEnd);

    if (slotEnd <= slotStart) {
      return NextResponse.json(
        { error: 'slotEnd must be after slotStart' },
        { status: 400 }
      );
    }

    // Load preferences
    const prefs = await prisma.discoveryPreferences.findUnique({
      where: { userId },
    });

    if (!prefs || !prefs.city) {
      return NextResponse.json(
        { error: 'Please set your city in Discover preferences first.' },
        { status: 400 }
      );
    }

    // Fetch and rank suggestions from external APIs
    const suggestions = await fetchAndRankSuggestions({
      city: prefs.city,
      radiusMiles: prefs.radiusMiles,
      interests: prefs.interests,
      slotStart,
      slotEnd,
    });

    // Persist to DB (upsert to avoid duplicates)
    const persisted = await persistSuggestions(userId, suggestions);

    // Return safe DTOs
    return NextResponse.json(
      persisted.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        category: s.category,
        venueName: s.venueName,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        url: s.url,
        imageUrl: s.imageUrl,
        distanceMiles: s.distanceMiles,
        isOpenAtTime: s.isOpenAtTime,
        confidence: s.confidence,
        status: s.status,
        source: s.source,
        slotStartAt: s.slotStartAt,
        slotEndAt: s.slotEndAt,
      }))
    );
  } catch (error) {
    console.error('[GET /api/suggestions]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Generate a stable fallback externalId when one is not provided.
 * Uses a hash of source + title + venueName + slotStartAt to avoid collisions.
 */
function stableExternalId(s: SuggestionDTO): string {
  if (s.externalId) return s.externalId;
  const raw = `${s.source}:${s.title}:${s.venueName ?? ''}:${s.slotStartAt}`;
  // Simple hash — not crypto, just stable dedup key
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return `gen-${Math.abs(hash).toString(36)}`;
}

/**
 * Persist suggestion DTOs to the database via upsert.
 * Returns the persisted rows.
 */
async function persistSuggestions(
  userId: string,
  suggestions: SuggestionDTO[]
) {
  const results = [];

  for (const s of suggestions) {
    const extId = stableExternalId(s);
    try {
      const row = await prisma.suggestion.upsert({
        where: {
          userId_externalId_slotStartAt: {
            userId,
            externalId: extId,
            slotStartAt: new Date(s.slotStartAt),
          },
        },
        update: {
          title: s.title,
          description: s.description,
          category: s.category,
          venueName: s.venueName,
          address: s.address,
          lat: s.lat,
          lng: s.lng,
          url: s.url,
          imageUrl: s.imageUrl,
          distanceMiles: s.distanceMiles,
          isOpenAtTime: s.isOpenAtTime as 'OPEN' | 'CLOSED' | 'UNKNOWN',
          confidence: s.confidence as 'HIGH' | 'LOW',
          rawPayload: (s.rawPayload as object) ?? undefined,
        },
        create: {
          userId,
          source: s.source,
          slotStartAt: new Date(s.slotStartAt),
          slotEndAt: new Date(s.slotEndAt),
          title: s.title,
          description: s.description,
          category: s.category,
          venueName: s.venueName,
          address: s.address,
          lat: s.lat,
          lng: s.lng,
          url: s.url,
          imageUrl: s.imageUrl,
          distanceMiles: s.distanceMiles,
          isOpenAtTime: s.isOpenAtTime as 'OPEN' | 'CLOSED' | 'UNKNOWN',
          confidence: s.confidence as 'HIGH' | 'LOW',
          status: 'PROPOSED',
          externalId: extId,
          rawPayload: (s.rawPayload as object) ?? undefined,
        },
      });
      results.push(row);
    } catch (err) {
      // Skip duplicates / constraint violations
      console.warn('[persistSuggestions] Upsert error for:', s.title, err);
    }
  }

  return results;
}
