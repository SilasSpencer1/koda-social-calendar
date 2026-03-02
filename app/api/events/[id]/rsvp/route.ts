import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import {
  sendRsvpAcceptedEmail,
  sendRsvpDeclinedEmail,
  isEmailEnabledForUser,
} from '@/lib/email';

const RSVPSchema = z.object({
  status: z.enum(['GOING', 'DECLINED']),
});

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

    const body = await request.json();
    const { status } = RSVPSchema.parse(body);

    // Find attendee record (include event + owner for notifications)
    const attendee = await prisma.attendee.findUnique({
      where: {
        eventId_userId: {
          eventId: id,
          userId: session.user.id,
        },
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            endAt: true,
            ownerId: true,
            owner: { select: { id: true, name: true, email: true } },
          },
        },
        user: { select: { name: true } },
      },
    });

    if (!attendee) {
      return NextResponse.json(
        { error: 'You are not invited to this event' },
        { status: 403 }
      );
    }

    // Block RSVP on past events (only for accepting; declining is always ok)
    if (status === 'GOING' && attendee.event.endAt < new Date()) {
      return NextResponse.json(
        { error: 'This event has already ended' },
        { status: 400 }
      );
    }

    // Update RSVP status
    const updated = await prisma.attendee.update({
      where: { id: attendee.id },
      data: { status },
    });

    // Notify event host about the RSVP
    const host = attendee.event.owner;
    const attendeeName = attendee.user.name || 'Someone';

    if (host.id !== session.user.id) {
      // In-app notification
      await prisma.notification.create({
        data: {
          userId: host.id,
          type: 'EVENT_INVITE',
          title:
            status === 'GOING'
              ? `${attendeeName} is going to your event`
              : `${attendeeName} declined your event`,
          body:
            status === 'GOING'
              ? `${attendeeName} accepted your invite to "${attendee.event.title}"`
              : `${attendeeName} declined your invite to "${attendee.event.title}"`,
          href: `/app/events/${attendee.event.id}`,
        },
      });

      // Email notification (non-blocking)
      isEmailEnabledForUser(host.id).then((enabled) => {
        if (!enabled) return;
        const emailFn =
          status === 'GOING' ? sendRsvpAcceptedEmail : sendRsvpDeclinedEmail;
        emailFn({
          to: host.email,
          hostName: host.name || 'there',
          attendeeName,
          eventTitle: attendee.event.title,
          eventId: attendee.event.id,
        }).catch((err) =>
          console.error('[EMAIL] RSVP notification failed:', err)
        );
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.errors },
        { status: 400 }
      );
    }
    console.error('[POST /api/events/:id/rsvp]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
