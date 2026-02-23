/**
 * Google Calendar API client.
 *
 * Uses raw fetch with the Google REST API (no googleapis dependency).
 * Handles OAuth token refresh transparently using refresh_token stored in
 * the NextAuth Account table (provider = "google").
 *
 * Tokens are never exposed to the client — this module runs server-side only.
 */

import { prisma } from '@/lib/db/prisma';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  status?: string; // "confirmed" | "tentative" | "cancelled"
  etag?: string;
  updated?: string; // RFC 3339
  htmlLink?: string;
}

export interface GoogleEventsListResponse {
  kind: string;
  etag: string;
  summary: string;
  updated: string;
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

/**
 * Retrieve a valid access token for a user's Google account.
 * Refreshes the token automatically when expired.
 */
export async function getAccessToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: 'google' },
  });

  if (!account) {
    throw new Error('No Google account linked for this user');
  }

  // Check if the current token is still valid (with 5-min buffer)
  const now = Math.floor(Date.now() / 1000);
  if (
    account.access_token &&
    account.expires_at &&
    account.expires_at > now + 300
  ) {
    return account.access_token;
  }

  // Need to refresh
  if (!account.refresh_token) {
    throw new Error('No refresh token available — user must re-connect Google');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: account.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Failed to refresh Google token: ${err}`);
  }

  const tokenData: GoogleTokenResponse = await tokenRes.json();

  // Persist new tokens
  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: tokenData.access_token,
      expires_at: now + tokenData.expires_in,
    },
  });

  return tokenData.access_token;
}

// ---------------------------------------------------------------------------
// Calendar API helpers
// ---------------------------------------------------------------------------

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

async function calendarFetch(
  userId: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken(userId);
  const res = await fetch(`${CALENDAR_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return res;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List events from the user's primary Google Calendar within a time window.
 * Automatically paginates through all results.
 */
export async function listEvents(
  userId: string,
  timeMin: Date,
  timeMax: Date,
  pageToken?: string
): Promise<{ events: GoogleCalendarEvent[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  if (pageToken) params.set('pageToken', pageToken);

  const res = await calendarFetch(
    userId,
    `/calendars/primary/events?${params.toString()}`
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Calendar listEvents failed: ${res.status} ${err}`);
  }

  const data: GoogleEventsListResponse = await res.json();
  return { events: data.items || [], nextPageToken: data.nextPageToken };
}

/**
 * Fetch ALL events (auto-paginate).
 */
export async function listAllEvents(
  userId: string,
  timeMin: Date,
  timeMax: Date
): Promise<GoogleCalendarEvent[]> {
  const allEvents: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;

  do {
    const result = await listEvents(userId, timeMin, timeMax, pageToken);
    allEvents.push(...result.events);
    pageToken = result.nextPageToken;
  } while (pageToken);

  return allEvents;
}

/**
 * Insert a new event into the user's primary Google Calendar.
 * Returns the created event (with its Google ID and etag).
 */
export async function insertEvent(
  userId: string,
  event: {
    summary: string;
    description?: string | null;
    location?: string | null;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
  }
): Promise<GoogleCalendarEvent> {
  const res = await calendarFetch(userId, '/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Calendar insertEvent failed: ${res.status} ${err}`);
  }

  return res.json();
}

/**
 * Update an existing event on Google Calendar.
 */
export async function updateEvent(
  userId: string,
  googleEventId: string,
  event: {
    summary: string;
    description?: string | null;
    location?: string | null;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
  }
): Promise<GoogleCalendarEvent> {
  const res = await calendarFetch(
    userId,
    `/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(event),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Calendar updateEvent failed: ${res.status} ${err}`);
  }

  return res.json();
}

/**
 * Delete an event from Google Calendar.
 */
export async function deleteEvent(
  userId: string,
  googleEventId: string
): Promise<void> {
  const res = await calendarFetch(
    userId,
    `/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
    { method: 'DELETE' }
  );

  // 410 Gone is fine (already deleted)
  if (!res.ok && res.status !== 410) {
    const err = await res.text();
    throw new Error(`Google Calendar deleteEvent failed: ${res.status} ${err}`);
  }
}
