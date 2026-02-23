/**
 * Suggestion ranking, deduplication, and pipeline orchestration.
 */

import type { SuggestionDTO, DiscoverQuery } from './types';
import { fetchTicketmasterEvents } from './ticketmaster';
import { fetchOsmPlaces } from './osm';

/**
 * Score a suggestion. Higher is better.
 */
function scoreSuggestion(s: SuggestionDTO, interests: string[]): number {
  let score = 50; // base

  // Proximity bonus (closer = higher)
  if (s.distanceMiles != null) {
    score += Math.max(0, 20 - s.distanceMiles * 2);
  }

  // Category match bonus
  if (s.category && interests.length > 0) {
    const catLower = s.category.toLowerCase();
    for (const interest of interests) {
      if (catLower.includes(interest.toLowerCase())) {
        score += 15;
        break;
      }
    }
  }

  // Open status bonus
  if (s.isOpenAtTime === 'OPEN') score += 10;

  // Ticketmaster events are time-specific — small bonus
  if (s.source === 'TICKETMASTER') score += 5;

  // High confidence bonus
  if (s.confidence === 'HIGH') score += 5;

  return score;
}

/**
 * Deduplicate suggestions by externalId and by (venueName + title) within a slot.
 */
function dedupe(suggestions: SuggestionDTO[]): SuggestionDTO[] {
  const seen = new Set<string>();
  const result: SuggestionDTO[] = [];

  for (const s of suggestions) {
    // Key by externalId first
    if (s.externalId && seen.has(s.externalId)) continue;

    // Key by venue+title
    const venueKey = `${(s.venueName ?? '').toLowerCase()}::${s.title.toLowerCase()}`;
    if (seen.has(venueKey)) continue;

    if (s.externalId) seen.add(s.externalId);
    seen.add(venueKey);
    result.push(s);
  }

  return result;
}

/**
 * Main suggestions pipeline:
 * 1. Fetch from Ticketmaster + OSM in parallel
 * 2. Filter out CLOSED (when hours are known)
 * 3. Deduplicate
 * 4. Score + rank
 * 5. Return top results
 */
export async function fetchAndRankSuggestions(
  query: DiscoverQuery,
  limit = 20
): Promise<SuggestionDTO[]> {
  // Fetch in parallel
  const [tmResults, osmResults] = await Promise.all([
    fetchTicketmasterEvents(query).catch((err) => {
      console.error('[Pipeline] Ticketmaster error:', err);
      return [] as SuggestionDTO[];
    }),
    fetchOsmPlaces(query).catch((err) => {
      console.error('[Pipeline] OSM error:', err);
      return [] as SuggestionDTO[];
    }),
  ]);

  let all = [...tmResults, ...osmResults];

  // Filter out CLOSED suggestions (hours are known and place is closed)
  all = all.filter((s) => s.isOpenAtTime !== 'CLOSED');

  // Deduplicate
  all = dedupe(all);

  // Score and sort descending
  const scored = all.map((s) => ({
    suggestion: s,
    score: scoreSuggestion(s, query.interests),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.suggestion);
}
