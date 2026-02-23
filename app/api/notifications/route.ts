import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/notifications
 *
 * Returns the last 50 notifications for the current user.
 * For EVENT_INVITE notifications, also returns the user's current attendee
 * status and whether the event is in the past, so the client can show the
 * correct action state without extra round-trips.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const notifications = await prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // ── Enrich EVENT_INVITE notifications with attendee status ──

    // Extract eventIds from href patterns like /app/events/{id}
    const hrefPattern = /\/app\/events\/([^/?]+)/;
    const inviteNotifs = notifications.filter(
      (n) => n.type === 'EVENT_INVITE' && n.href
    );
    const eventIdMap = new Map<string, string>(); // notifId -> eventId
    for (const n of inviteNotifs) {
      const match = n.href!.match(hrefPattern);
      if (match) eventIdMap.set(n.id, match[1]);
    }

    const uniqueEventIds = [...new Set(eventIdMap.values())];

    // Batch-fetch attendee records and event end times
    let attendeeMap = new Map<string, string>(); // eventId -> status
    let eventEndMap = new Map<string, Date>(); // eventId -> endAt
    if (uniqueEventIds.length > 0) {
      const [attendees, events] = await Promise.all([
        prisma.attendee.findMany({
          where: {
            userId: session.user.id,
            eventId: { in: uniqueEventIds },
          },
          select: { eventId: true, status: true },
        }),
        prisma.event.findMany({
          where: { id: { in: uniqueEventIds } },
          select: { id: true, endAt: true },
        }),
      ]);
      attendeeMap = new Map(attendees.map((a) => [a.eventId, a.status]));
      eventEndMap = new Map(events.map((e) => [e.id, e.endAt]));
    }

    // Attach enrichment fields
    const now = new Date();
    const enriched = notifications.map((n) => {
      const eventId = eventIdMap.get(n.id);
      if (!eventId) return n;

      const attendeeStatus = attendeeMap.get(eventId) ?? null;
      const endAt = eventEndMap.get(eventId);
      const isPast = endAt ? endAt < now : false;

      return { ...n, attendeeStatus, eventId, isPast };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    console.error('[GET /api/notifications]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
