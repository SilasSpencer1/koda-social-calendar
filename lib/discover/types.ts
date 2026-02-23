/**
 * Shared types for the Discover suggestions pipeline.
 */

export interface SuggestionDTO {
  id?: string;
  source: 'TICKETMASTER' | 'OSM';
  title: string;
  description?: string;
  category?: string;
  venueName?: string;
  address?: string;
  lat?: number;
  lng?: number;
  url?: string;
  imageUrl?: string;
  distanceMiles?: number;
  isOpenAtTime: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  confidence: 'HIGH' | 'LOW';
  externalId?: string;
  rawPayload?: unknown;
  // Slot times carried through
  slotStartAt: string;
  slotEndAt: string;
}

export interface DiscoverQuery {
  city: string;
  radiusMiles: number;
  interests: string[];
  slotStart: Date;
  slotEnd: Date;
}
