/**
 * Google Calendar 2-way sync service.
 *
 * Sync flow: syncAll = syncPull → syncPush
 *
 * LOOP PREVENTION
 * ───────────────
 * - Each mapping stores googleEtag + lastPulledAt + lastPushedAt.
 * - syncPull: skips update when Google etag matches stored etag (no change).
 * - syncPush: skips push when Koda event.updatedAt <= mapping.lastPushedAt.
 * - Events with source=GOOGLE are never pushed back to Google (prevents ping-pong).
 *
 * DISCONNECT BEHAVIOUR (Option A)
 * ───────────────────────────────
 * On disconnect, imported events (source=GOOGLE) are kept but stop syncing.
 * GoogleCalendarConnection + GoogleEventMapping rows are deleted.
 *
 * IDEMPOTENCY
 * ───────────
 * Running syncAll repeatedly produces the same state (upsert semantics).
 */

import { prisma } from '@/lib/db/prisma';
import * as googleClient from './client';
import type { GoogleCalendarEvent } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncSummary {
  pulled: number;
  pushed: number;
  updated: number;
  deleted: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// PULL — Google → Koda
// ---------------------------------------------------------------------------

export async function syncPull(userId: string): Promise<SyncSummary> {
  const summary: SyncSummary = {
    pulled: 0,
    pushed: 0,
    updated: 0,
    deleted: 0,
    errors: [],
  };

  // Get connection preferences (or defaults)
  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { userId },
  });

  const pastDays = connection?.syncWindowPastDays ?? 30;
  const futureDays = connection?.syncWindowFutureDays ?? 90;

  const now = new Date();
  const timeMin = new Date(now.getTime() - pastDays * 86_400_000);
  const timeMax = new Date(now.getTime() + futureDays * 86_400_000);

  let googleEvents: GoogleCalendarEvent[];
  try {
    googleEvents = await googleClient.listAllEvents(userId, timeMin, timeMax);
  } catch (err) {
    summary.errors.push(`listEvents: ${(err as Error).message}`);
    return summary;
  }

  for (const gEvent of googleEvents) {
    try {
      // Skip all-day events without dateTime (only date)
      const startDt = gEvent.start?.dateTime || gEvent.start?.date;
      const endDt = gEvent.end?.dateTime || gEvent.end?.date;
      if (!startDt || !endDt || !gEvent.id) continue;

      // Skip cancelled events
      if (gEvent.status === 'cancelled') {
        // If we have a mapping, delete the Koda event
        const existing = await prisma.googleEventMapping.findUnique({
          where: { userId_googleEventId: { userId, googleEventId: gEvent.id } },
        });
        if (existing) {
          await prisma.event
            .delete({ where: { id: existing.kodaEventId } })
            .catch(() => {});
          await prisma.googleEventMapping
            .delete({ where: { id: existing.id } })
            .catch(() => {});
          summary.deleted++;
        }
        continue;
      }

      // Check existing mapping
      const existingMapping = await prisma.googleEventMapping.findUnique({
        where: { userId_googleEventId: { userId, googleEventId: gEvent.id } },
      });

      if (existingMapping) {
        // LOOP PREVENTION: skip if etag unchanged
        if (
          existingMapping.googleEtag &&
          gEvent.etag &&
          existingMapping.googleEtag === gEvent.etag
        ) {
          continue;
        }

        // Update existing Koda event
        await prisma.event.update({
          where: { id: existingMapping.kodaEventId },
          data: {
            title: gEvent.summary || 'Untitled',
            description: gEvent.description || null,
            locationName: gEvent.location || null,
            startAt: new Date(startDt),
            endAt: new Date(endDt),
            timezone: gEvent.start?.timeZone || 'UTC',
          },
        });

        await prisma.googleEventMapping.update({
          where: { id: existingMapping.id },
          data: {
            googleEtag: gEvent.etag || null,
            googleUpdatedAt: gEvent.updated ? new Date(gEvent.updated) : null,
            lastPulledAt: new Date(),
          },
        });

        summary.updated++;
      } else {
        // Create new Koda event (imported from Google)
        const kodaEvent = await prisma.event.create({
          data: {
            ownerId: userId,
            title: gEvent.summary || 'Untitled',
            description: gEvent.description || null,
            locationName: gEvent.location || null,
            startAt: new Date(startDt),
            endAt: new Date(endDt),
            timezone: gEvent.start?.timeZone || 'UTC',
            visibility: 'PRIVATE',
            coverMode: 'NONE',
            source: 'GOOGLE',
            externalId: gEvent.id,
          },
        });

        await prisma.googleEventMapping.create({
          data: {
            userId,
            kodaEventId: kodaEvent.id,
            googleEventId: gEvent.id,
            googleEtag: gEvent.etag || null,
            googleUpdatedAt: gEvent.updated ? new Date(gEvent.updated) : null,
            lastPulledAt: new Date(),
          },
        });

        summary.pulled++;
      }
    } catch (err) {
      summary.errors.push(`pull event ${gEvent.id}: ${(err as Error).message}`);
    }
  }

  return summary;
}

// ---------------------------------------------------------------------------
// PUSH — Koda → Google
// ---------------------------------------------------------------------------

export async function syncPush(userId: string): Promise<SyncSummary> {
  const summary: SyncSummary = {
    pulled: 0,
    pushed: 0,
    updated: 0,
    deleted: 0,
    errors: [],
  };

  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { userId },
  });

  const globalPush = connection?.pushEnabled ?? false;

  // Find Koda events eligible for push:
  // - source = KODA (never push imported events back)
  // - globalPush OR per-event syncToGoogle flag
  const kodaEvents = await prisma.event.findMany({
    where: {
      ownerId: userId,
      source: 'KODA',
      ...(globalPush ? {} : { syncToGoogle: true }),
    },
    include: {
      googleEventMapping: true,
    },
  });

  for (const event of kodaEvents) {
    // Skip events that don't qualify (when global push is on but per-event is off, still push)
    if (!globalPush && !event.syncToGoogle) continue;

    try {
      const mapping = event.googleEventMapping;

      const googlePayload = {
        summary: event.title,
        description: event.description || undefined,
        location: event.locationName || undefined,
        start: {
          dateTime: event.startAt.toISOString(),
          timeZone: event.timezone,
        },
        end: { dateTime: event.endAt.toISOString(), timeZone: event.timezone },
      };

      if (mapping) {
        // LOOP PREVENTION: skip if Koda event hasn't changed since last push
        if (mapping.lastPushedAt && event.updatedAt <= mapping.lastPushedAt) {
          continue;
        }

        // Update existing Google event
        const updated = await googleClient.updateEvent(
          userId,
          mapping.googleEventId,
          googlePayload
        );

        await prisma.googleEventMapping.update({
          where: { id: mapping.id },
          data: {
            googleEtag: updated.etag || null,
            googleUpdatedAt: updated.updated ? new Date(updated.updated) : null,
            lastPushedAt: new Date(),
          },
        });

        summary.updated++;
      } else {
        // Insert new event into Google
        const created = await googleClient.insertEvent(userId, googlePayload);

        await prisma.googleEventMapping.create({
          data: {
            userId,
            kodaEventId: event.id,
            googleEventId: created.id,
            googleEtag: created.etag || null,
            googleUpdatedAt: created.updated ? new Date(created.updated) : null,
            lastPushedAt: new Date(),
          },
        });

        summary.pushed++;
      }
    } catch (err) {
      summary.errors.push(`push event ${event.id}: ${(err as Error).message}`);
    }
  }

  // Note: Deleted Koda events are handled via Prisma cascade (onDelete: Cascade
  // on GoogleEventMapping.event relation). If we want to also delete from Google,
  // that should be handled via the event deletion API route or a webhook.

  return summary;
}

// ---------------------------------------------------------------------------
// SYNC ALL — Pull then Push
// ---------------------------------------------------------------------------

/**
 * Run a full bidirectional sync for a user.
 * Order: Pull first (get latest from Google), then Push (send Koda changes).
 * This ensures we don't push stale data.
 */
export async function syncAll(userId: string): Promise<SyncSummary> {
  const pullSummary = await syncPull(userId);
  const pushSummary = await syncPush(userId);

  // Update lastSyncedAt
  await prisma.googleCalendarConnection.upsert({
    where: { userId },
    update: { lastSyncedAt: new Date() },
    create: {
      userId,
      isEnabled: true,
      lastSyncedAt: new Date(),
    },
  });

  return {
    pulled: pullSummary.pulled,
    pushed: pushSummary.pushed,
    updated: pullSummary.updated + pushSummary.updated,
    deleted: pullSummary.deleted + pushSummary.deleted,
    errors: [...pullSummary.errors, ...pushSummary.errors],
  };
}
