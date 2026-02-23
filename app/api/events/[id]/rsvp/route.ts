import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';

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

    // Find attendee record (include event to check dates)
    const attendee = await prisma.attendee.findUnique({
      where: {
        eventId_userId: {
          eventId: id,
          userId: session.user.id,
        },
      },
      include: {
        event: { select: { endAt: true } },
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
