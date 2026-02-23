import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';

const InviteSchema = z.object({
  userIds: z.array(z.string()).min(1),
});

async function sendInviteEmail(
  inviteeEmail: string,
  eventTitle: string,
  eventTime: string
) {
  const emailEnabled = process.env.EMAIL_ENABLED === 'true';
  if (!emailEnabled) {
    console.log(
      `[EMAIL] Dev mode: Event invite for ${inviteeEmail} - ${eventTitle} at ${eventTime}`
    );
    return;
  }

  try {
    // Will be implemented with Resend
    console.log(`[EMAIL] Sending invite to ${inviteeEmail} for ${eventTitle}`);
  } catch (error) {
    console.error('[SEND_EMAIL]', error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const event = await prisma.event.findUnique({
      where: { id },
      select: {
        id: true,
        ownerId: true,
        title: true,
        startAt: true,
        attendees: {
          select: { userId: true },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Only owner can invite
    if (event.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { userIds } = InviteSchema.parse(body);

    // Validate users exist and are friends
    const invitees = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, name: true },
    });

    if (invitees.length !== userIds.length) {
      return NextResponse.json(
        { error: 'One or more users not found' },
        { status: 400 }
      );
    }

    // Batch-check friendship and block status for all invitees at once (avoids N+1)
    const inviteeIds = invitees.map((u) => u.id);

    const [blockedRelations, acceptedFriendships] = await Promise.all([
      prisma.friendship.findMany({
        where: {
          status: 'BLOCKED',
          OR: [
            { requesterId: session.user.id, addresseeId: { in: inviteeIds } },
            { requesterId: { in: inviteeIds }, addresseeId: session.user.id },
          ],
        },
        select: { requesterId: true, addresseeId: true },
      }),
      prisma.friendship.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [
            { requesterId: session.user.id, addresseeId: { in: inviteeIds } },
            { requesterId: { in: inviteeIds }, addresseeId: session.user.id },
          ],
        },
        select: { requesterId: true, addresseeId: true },
      }),
    ]);

    const blockedUserIds = new Set(
      blockedRelations.flatMap((r) => [r.requesterId, r.addresseeId])
    );
    blockedUserIds.delete(session.user.id);

    const friendUserIds = new Set(
      acceptedFriendships.map((r) =>
        r.requesterId === session.user?.id ? r.addresseeId : r.requesterId
      )
    );

    const validInvitees = invitees.filter((invitee) => {
      if (blockedUserIds.has(invitee.id)) {
        console.warn(`Cannot invite blocked user ${invitee.id}`);
        return false;
      }
      if (!friendUserIds.has(invitee.id)) {
        console.warn(`Cannot invite non-friend ${invitee.id}`);
        return false;
      }
      return true;
    });

    if (validInvitees.length === 0) {
      return NextResponse.json(
        { error: 'No valid invitees found (must be accepted friends)' },
        { status: 400 }
      );
    }

    // Check if already invited/attending
    const alreadyInvited = event.attendees.map((a) => a.userId);
    const newInvitees = validInvitees.filter(
      (u) => !alreadyInvited.includes(u.id)
    );

    if (newInvitees.length === 0) {
      return NextResponse.json(
        { error: 'All users are already invited to this event' },
        { status: 400 }
      );
    }

    // Create attendee records and notifications
    const attendees = await Promise.all(
      newInvitees.map(async (invitee) => {
        const attendee = await prisma.attendee.create({
          data: {
            eventId: event.id,
            userId: invitee.id,
            status: 'INVITED',
            anonymity: 'NAMED',
            role: 'ATTENDEE',
          },
        });

        // Create in-app notification
        await prisma.notification.create({
          data: {
            userId: invitee.id,
            type: 'EVENT_INVITE',
            title: 'You were invited to an event',
            body: `${session.user?.name || 'Someone'} invited you to "${event.title}"`,
            href: `/app/events/${event.id}`,
          },
        });

        // Send email notification
        await sendInviteEmail(
          invitee.email,
          event.title,
          event.startAt.toISOString()
        );

        return attendee;
      })
    );

    return NextResponse.json(
      { attendees, inviteCount: attendees.length },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.errors },
        { status: 400 }
      );
    }
    console.error('[POST /api/events/:id/invite]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
