import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';

const ActionSchema = z.object({
  action: z.enum(['approve', 'deny']),
});

/**
 * PATCH /api/public/events/:id/join-requests/:requestId
 *
 * Host approve or deny a join request.
 *
 * On approve:
 * - Create attendee row (role: ATTENDEE, status: GOING, anonymity: NAMED)
 * - Notify requester
 *
 * On deny:
 * - Mark request DENIED
 * - Notify requester
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  try {
    const { id, requestId } = await params;
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const event = await prisma.event.findUnique({
      where: { id },
      select: { id: true, ownerId: true, title: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Only host
    if (event.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { action } = ActionSchema.parse(body);

    const joinRequest = await prisma.joinRequest.findUnique({
      where: { id: requestId },
      include: {
        requester: { select: { id: true, name: true } },
      },
    });

    if (!joinRequest || joinRequest.eventId !== id) {
      return NextResponse.json(
        { error: 'Join request not found' },
        { status: 404 }
      );
    }

    if (joinRequest.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Join request is not pending' },
        { status: 400 }
      );
    }

    if (action === 'approve') {
      // Atomic: update request + create attendee + notify
      const [updated, attendee] = await prisma.$transaction(async (tx) => {
        const updatedReq = await tx.joinRequest.update({
          where: { id: requestId },
          data: { status: 'APPROVED' },
        });

        const newAttendee = await tx.attendee.create({
          data: {
            eventId: id,
            userId: joinRequest.requesterId,
            role: 'ATTENDEE',
            status: 'GOING',
            anonymity: 'NAMED',
          },
        });

        await tx.notification.create({
          data: {
            userId: joinRequest.requesterId,
            type: 'JOIN_REQUEST_APPROVED',
            title: 'Join request approved',
            body: `Your request to join "${event.title}" was approved!`,
            href: `/app/public/events/${event.id}`,
          },
        });

        return [updatedReq, newAttendee] as const;
      });

      return NextResponse.json({ joinRequest: updated, attendee });
    } else {
      // Atomic: deny request + notify
      const updated = await prisma.$transaction(async (tx) => {
        const updatedReq = await tx.joinRequest.update({
          where: { id: requestId },
          data: { status: 'DENIED' },
        });

        await tx.notification.create({
          data: {
            userId: joinRequest.requesterId,
            type: 'JOIN_REQUEST_DENIED',
            title: 'Join request denied',
            body: `Your request to join "${event.title}" was not approved.`,
            href: `/app/public/events/${event.id}`,
          },
        });

        return updatedReq;
      });

      return NextResponse.json({ joinRequest: updated });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.errors },
        { status: 400 }
      );
    }
    console.error(
      '[PATCH /api/public/events/:id/join-requests/:requestId]',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
