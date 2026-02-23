import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { checkRateLimit } from '@/lib/rate-limit';

const ACTION_RATE_LIMIT = {
  maxRequests: 100,
  windowMs: 60 * 60 * 1000, // 1 hour
  keyPrefix: 'suggestion-action',
};

/**
 * POST /api/suggestions/:id/add-to-calendar
 *
 * Creates a Koda Event from a suggestion and marks it ADDED.
 * - title from suggestion
 * - startAt/endAt from slot
 * - locationName from venueName + address
 * - visibility default FRIENDS
 * - owner = current user, HOST attendee created
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

    const userId = session.user.id;

    const rl = await checkRateLimit(userId, ACTION_RATE_LIMIT);
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const suggestion = await prisma.suggestion.findUnique({ where: { id } });
    if (!suggestion || suggestion.userId !== userId) {
      return NextResponse.json(
        { error: 'Suggestion not found' },
        { status: 404 }
      );
    }

    if (suggestion.status === 'ADDED') {
      return NextResponse.json(
        { error: 'Suggestion already added to calendar' },
        { status: 409 }
      );
    }

    // Atomic: create event + mark suggestion ADDED
    const [event] = await prisma.$transaction(async (tx) => {
      const newEvent = await tx.event.create({
        data: {
          ownerId: userId,
          title: suggestion.title,
          description: suggestion.description,
          locationName:
            [suggestion.venueName, suggestion.address]
              .filter(Boolean)
              .join(' — ') || null,
          startAt: suggestion.slotStartAt,
          endAt: suggestion.slotEndAt,
          timezone: 'UTC',
          visibility: 'FRIENDS',
          coverMode: 'NONE',
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

      await tx.suggestion.update({
        where: { id },
        data: { status: 'ADDED' },
      });

      return [newEvent] as const;
    });

    return NextResponse.json({ eventId: event.id }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/suggestions/:id/add-to-calendar]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
