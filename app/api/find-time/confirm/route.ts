import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import type { EventVisibility, CoverMode } from '@prisma/client';

const ConfirmSlotSchema = z.object({
  title: z.string().min(1).max(255),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  timezone: z.string().default('UTC'),
  visibility: z.enum(['FRIENDS', 'PRIVATE', 'PUBLIC']).default('FRIENDS'),
  coverMode: z.enum(['NONE', 'BUSY_ONLY']).default('NONE'),
  locationName: z.string().optional(),
  inviteeIds: z.array(z.string()),
});

/**
 * POST /api/find-time/confirm
 *
 * Convert a chosen time slot into an event with invites.
 * Reuses Sprint 3 invite logic (friendship + block checks).
 *
 * - Creates event owned by requester
 * - Creates host attendee row (GOING, HOST)
 * - Invites inviteeIds (creates attendee rows + notifications)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const data = ConfirmSlotSchema.parse(body);

    const startTime = new Date(data.startAt);
    const endTime = new Date(data.endAt);

    if (endTime <= startTime) {
      return NextResponse.json(
        { error: 'Event end time must be after start time' },
        { status: 400 }
      );
    }

    // Validate invitees: must be accepted friends and not blocked
    const inviteeIds = [...new Set(data.inviteeIds)].filter(
      (id) => id !== userId
    );

    if (inviteeIds.length > 0) {
      // Batch check friendship and block status
      const [blockedRelations, acceptedFriendships] = await Promise.all([
        prisma.friendship.findMany({
          where: {
            status: 'BLOCKED',
            OR: [
              { requesterId: userId, addresseeId: { in: inviteeIds } },
              { requesterId: { in: inviteeIds }, addresseeId: userId },
            ],
          },
          select: { requesterId: true, addresseeId: true },
        }),
        prisma.friendship.findMany({
          where: {
            status: 'ACCEPTED',
            OR: [
              { requesterId: userId, addresseeId: { in: inviteeIds } },
              { requesterId: { in: inviteeIds }, addresseeId: userId },
            ],
          },
          select: { requesterId: true, addresseeId: true },
        }),
      ]);

      const blockedUserIds = new Set(
        blockedRelations.flatMap((r) => [r.requesterId, r.addresseeId])
      );
      blockedUserIds.delete(userId);

      const friendUserIds = new Set(
        acceptedFriendships.map((r) =>
          r.requesterId === userId ? r.addresseeId : r.requesterId
        )
      );

      const invalidIds = inviteeIds.filter(
        (id) => blockedUserIds.has(id) || !friendUserIds.has(id)
      );

      if (invalidIds.length > 0) {
        return NextResponse.json(
          {
            error: 'Some invitees are not accepted friends or are blocked',
            invalidIds,
          },
          { status: 400 }
        );
      }
    }

    // Verify invitees exist
    if (inviteeIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: inviteeIds } },
        select: { id: true },
      });
      if (users.length !== inviteeIds.length) {
        return NextResponse.json(
          { error: 'One or more invitees not found' },
          { status: 400 }
        );
      }
    }

    // Atomic: create event + host attendee + invitee rows + notifications
    const event = await prisma.$transaction(async (tx) => {
      const newEvent = await tx.event.create({
        data: {
          ownerId: userId,
          title: data.title,
          description: null,
          locationName: data.locationName || null,
          startAt: startTime,
          endAt: endTime,
          timezone: data.timezone,
          visibility: data.visibility as EventVisibility,
          coverMode: data.coverMode as CoverMode,
          attendees: {
            create: {
              userId,
              role: 'HOST',
              status: 'GOING',
              anonymity: 'NAMED',
            },
          },
        },
      });

      // Create invitee attendee rows and notifications
      for (const inviteeId of inviteeIds) {
        await tx.attendee.create({
          data: {
            eventId: newEvent.id,
            userId: inviteeId,
            role: 'ATTENDEE',
            status: 'INVITED',
            anonymity: 'NAMED',
          },
        });

        await tx.notification.create({
          data: {
            userId: inviteeId,
            type: 'EVENT_INVITE',
            title: 'You were invited to an event',
            body: `${session.user?.name || 'Someone'} invited you to "${newEvent.title}"`,
            href: `/app/events/${newEvent.id}`,
          },
        });
      }

      return newEvent;
    });

    return NextResponse.json({ eventId: event.id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.errors },
        { status: 400 }
      );
    }
    console.error('[POST /api/find-time/confirm]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
