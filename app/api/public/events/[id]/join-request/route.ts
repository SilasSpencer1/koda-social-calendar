import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { isBlocked } from '@/lib/policies/friendship';
import { checkRateLimit } from '@/lib/rate-limit';

const JOIN_REQUEST_RATE_LIMIT = {
  maxRequests: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
  keyPrefix: 'join-request',
};

/**
 * POST /api/public/events/:id/join-request
 *
 * Create a join request for a PUBLIC event.
 *
 * Rules:
 * - Event must be PUBLIC
 * - Viewer must not be already an attendee
 * - No existing non-canceled join request
 * - Block checks (bidirectional)
 * - Rate limited (10/hour/user)
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requesterId = session.user.id;

    // Rate limit
    const rateLimitResult = await checkRateLimit(
      requesterId,
      JOIN_REQUEST_RATE_LIMIT
    );
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many join requests. Try again later.' },
        { status: 429 }
      );
    }

    const event = await prisma.event.findUnique({
      where: { id },
      select: {
        id: true,
        ownerId: true,
        title: true,
        visibility: true,
        attendees: { select: { userId: true } },
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (event.visibility !== 'PUBLIC') {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Block check
    const blocked = await isBlocked(requesterId, event.ownerId);
    if (blocked) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Already an attendee
    if (event.attendees.some((a) => a.userId === requesterId)) {
      return NextResponse.json(
        { error: 'You are already an attendee of this event' },
        { status: 409 }
      );
    }

    // Check for existing non-canceled join request
    const existing = await prisma.joinRequest.findUnique({
      where: {
        eventId_requesterId: { eventId: id, requesterId },
      },
    });

    if (existing) {
      if (existing.status === 'PENDING') {
        return NextResponse.json(
          { error: 'Join request already pending' },
          { status: 409 }
        );
      }
      if (existing.status === 'APPROVED') {
        return NextResponse.json(
          { error: 'Join request already approved' },
          { status: 409 }
        );
      }
      if (existing.status === 'DENIED') {
        return NextResponse.json(
          { error: 'Your join request was denied by the host' },
          { status: 403 }
        );
      }
      // CANCELED — allow re-request by updating status back to PENDING
      const updated = await prisma.joinRequest.update({
        where: { id: existing.id },
        data: { status: 'PENDING' },
      });

      // Notify host
      await prisma.notification.create({
        data: {
          userId: event.ownerId,
          type: 'JOIN_REQUEST',
          title: 'New join request',
          body: `${session.user.name || 'Someone'} wants to join "${event.title}"`,
          href: `/app/public/events/${event.id}`,
        },
      });

      return NextResponse.json(
        { ok: true, status: updated.status },
        { status: 200 }
      );
    }

    // Create new join request
    const joinRequest = await prisma.joinRequest.create({
      data: {
        eventId: id,
        requesterId,
        status: 'PENDING',
      },
    });

    // Notify host
    await prisma.notification.create({
      data: {
        userId: event.ownerId,
        type: 'JOIN_REQUEST',
        title: 'New join request',
        body: `${session.user.name || 'Someone'} wants to join "${event.title}"`,
        href: `/app/public/events/${event.id}`,
      },
    });

    return NextResponse.json(
      { ok: true, status: joinRequest.status },
      { status: 201 }
    );
  } catch (error) {
    console.error('[POST /api/public/events/:id/join-request]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/public/events/:id/join-request
 *
 * Cancel a pending join request.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requesterId = session.user.id;

    const existing = await prisma.joinRequest.findUnique({
      where: {
        eventId_requesterId: { eventId: id, requesterId },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'No join request found' },
        { status: 404 }
      );
    }

    if (existing.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Can only cancel a pending join request' },
        { status: 400 }
      );
    }

    const updated = await prisma.joinRequest.update({
      where: { id: existing.id },
      data: { status: 'CANCELED' },
    });

    return NextResponse.json({ ok: true, status: updated.status });
  } catch (error) {
    console.error('[DELETE /api/public/events/:id/join-request]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
