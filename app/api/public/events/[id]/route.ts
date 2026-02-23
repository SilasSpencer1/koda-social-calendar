import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { isBlocked } from '@/lib/policies/friendship';
import { isAttendeeAnonymous } from '@/lib/policies/eventAccess';

/**
 * GET /api/public/events/:id
 *
 * Public event read endpoint. Returns event data for PUBLIC events.
 * Requires login for MVP (protects private data, simplifies block checks).
 *
 * Authorization:
 * - Event must have visibility = PUBLIC
 * - Blocked users cannot view
 * - Attendee anonymity is enforced (anonymous attendees show as "Anonymous attendee")
 *
 * Response includes viewerState so the UI can render contextually.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const viewerId = session.user.id;

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, name: true, avatarUrl: true },
        },
        attendees: {
          select: {
            id: true,
            userId: true,
            status: true,
            anonymity: true,
            role: true,
            user: {
              select: { id: true, name: true, avatarUrl: true },
            },
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Must be PUBLIC
    if (event.visibility !== 'PUBLIC') {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Block check: if viewer blocked host or vice-versa, deny access
    const blocked = await isBlocked(viewerId, event.ownerId);
    if (blocked) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const isHost = event.ownerId === viewerId;
    const isAttendee = event.attendees.some((a) => a.userId === viewerId);

    // Get viewer's join request status if any
    const joinRequest = await prisma.joinRequest.findUnique({
      where: {
        eventId_requesterId: { eventId: id, requesterId: viewerId },
      },
      select: { status: true },
    });

    // Redact anonymous attendees (host sees all, self sees self)
    const redactedAttendees = event.attendees.map((attendee) => {
      if (
        isAttendeeAnonymous(attendee.anonymity) &&
        !isHost &&
        attendee.userId !== viewerId
      ) {
        return {
          id: attendee.id,
          userId: null,
          name: 'Anonymous attendee',
          avatarUrl: null,
          status: attendee.status,
          role: attendee.role,
        };
      }
      return {
        id: attendee.id,
        userId: attendee.userId,
        name: attendee.user.name,
        avatarUrl: attendee.user.avatarUrl,
        status: attendee.status,
        role: attendee.role,
      };
    });

    return NextResponse.json({
      event: {
        id: event.id,
        title: event.title,
        description: event.description,
        startAt: event.startAt,
        endAt: event.endAt,
        timezone: event.timezone,
        locationName: event.locationName,
        hostId: event.ownerId,
        visibility: event.visibility,
        owner: event.owner,
      },
      attendees: redactedAttendees,
      viewerState: {
        isHost,
        isAttendee,
        joinRequestStatus: joinRequest?.status ?? null,
      },
    });
  } catch (error) {
    console.error('[GET /api/public/events/:id]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
