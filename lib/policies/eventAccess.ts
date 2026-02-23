/**
 * Event access policies and redaction logic
 * Single source of truth for what viewers can see
 */

import { prisma } from '@/lib/db/prisma';
import type { Event, DetailLevel } from '@prisma/client';
import { isBlocked } from './friendship';

/**
 * Determine if a viewer can see event details (full or redacted)
 * Returns true if viewer is allowed to see ANY details (not just busy block)
 *
 * Rules:
 * 1. Owner always sees full details
 * 2. If blocked: cannot see
 * 3. Get friend sharing override: canViewCalendar + detailLevel
 * 4. If not allowed to view: return false (403/404)
 * 5. Event visibility:
 *    - PRIVATE: only owner
 *    - FRIENDS: check if friend + canViewCalendar
 *    - PUBLIC: allow for now (no random web access yet)
 */
export async function canViewerSeeEvent(
  event: Event,
  viewerId: string
): Promise<boolean> {
  // Owner always sees full details
  if (event.ownerId === viewerId) {
    return true;
  }

  // Check if blocked
  const blocked = await isBlocked(viewerId, event.ownerId);
  if (blocked) {
    return false;
  }

  // Get friend sharing override
  const friendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        {
          requesterId: viewerId,
          addresseeId: event.ownerId,
          status: 'ACCEPTED',
        },
        {
          requesterId: event.ownerId,
          addresseeId: viewerId,
          status: 'ACCEPTED',
        },
      ],
    },
    select: {
      canViewCalendar: true,
    },
  });

  // If not accepted friends, cannot view
  if (!friendship) {
    return false;
  }

  // Must have calendar view permission
  if (!friendship.canViewCalendar) {
    return false;
  }

  // Check event visibility
  if (event.visibility === 'PRIVATE') {
    return false; // Never show to non-owner
  }

  if (event.visibility === 'FRIENDS' || event.visibility === 'PUBLIC') {
    return true; // Allowed to view (will apply detail level redaction)
  }

  return false;
}

/**
 * Get the detail level a viewer is allowed to see for an event
 * Only call this after confirming viewer is allowed to see the event
 *
 * Rules:
 * - Owner: DETAILS
 * - coverMode BUSY_ONLY: always BUSY_ONLY to non-owner
 * - Otherwise: use friendship detailLevel (or default BUSY_ONLY if not friends)
 */
export async function getViewerDetailLevel(
  event: Event,
  viewerId: string
): Promise<DetailLevel> {
  // Owner always gets DETAILS
  if (event.ownerId === viewerId) {
    return 'DETAILS';
  }

  // If event has BUSY_ONLY cover mode, always show BUSY_ONLY
  if (event.coverMode === 'BUSY_ONLY') {
    return 'BUSY_ONLY';
  }

  // Get friend sharing override
  const friendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        {
          requesterId: viewerId,
          addresseeId: event.ownerId,
          status: 'ACCEPTED',
        },
        {
          requesterId: event.ownerId,
          addresseeId: viewerId,
          status: 'ACCEPTED',
        },
      ],
    },
    select: {
      detailLevel: true,
    },
  });

  return friendship?.detailLevel ?? 'BUSY_ONLY';
}

/**
 * Redact an event for a viewer based on detail level
 * Call after confirming viewer is allowed to see it
 */
export function redactEventForViewer(
  event: Event,
  detailLevel: DetailLevel
): Partial<Event> {
  if (detailLevel === 'DETAILS') {
    return event; // Full details
  }

  // BUSY_ONLY: redact title, description, location
  return {
    ...event,
    title: 'Busy',
    description: null,
    locationName: null,
  };
}

/**
 * Check if attendee should be anonymized in attendee list
 * Used to redact attendee identity
 */
export function isAttendeeAnonymous(anonymity: string): boolean {
  return anonymity === 'ANONYMOUS';
}
