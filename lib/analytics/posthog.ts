/**
 * PostHog analytics client.
 *
 * Gated by NEXT_PUBLIC_POSTHOG_KEY — disabled when not set (e.g., local dev).
 * Tracks key product events without duplicating excessively.
 */

'use client';

import posthog from 'posthog-js';

let initialized = false;

export function initPostHog() {
  if (initialized) return;
  if (typeof window === 'undefined') return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

  if (!key) return;

  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
    autocapture: false, // Explicit events only
  });

  initialized = true;
}

// ---------------------------------------------------------------------------
// Tracked events
// ---------------------------------------------------------------------------

export function trackSignup(userId: string) {
  if (!initialized) return;
  posthog.identify(userId);
  posthog.capture('user_signed_up');
}

export function trackLogin(userId: string) {
  if (!initialized) return;
  posthog.identify(userId);
  posthog.capture('user_logged_in');
}

export function trackInviteSent(eventId: string, inviteeCount: number) {
  if (!initialized) return;
  posthog.capture('invite_sent', { eventId, inviteeCount });
}

export function trackRSVP(eventId: string, status: 'GOING' | 'DECLINED') {
  if (!initialized) return;
  posthog.capture('rsvp_submitted', { eventId, status });
}

export function trackSuggestionAdded(suggestionId: string) {
  if (!initialized) return;
  posthog.capture('suggestion_added_to_calendar', { suggestionId });
}

export function trackGoogleSync(direction: 'manual' | 'auto') {
  if (!initialized) return;
  posthog.capture('google_calendar_synced', { direction });
}
