import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limit';
import { getFriendCalendarPermission } from '@/lib/policies/calendarAccess';
import {
  mergeIntervals,
  invertToFree,
  intersectFree,
  pickSlots,
  type Interval,
} from '@/lib/availability';

const FIND_TIME_RATE_LIMIT = {
  maxRequests: 20,
  windowMs: 60 * 60 * 1000, // 1 hour
  keyPrefix: 'find-time',
};

const FindTimeSchema = z.object({
  participantIds: z.array(z.string()).min(1),
  from: z.string().datetime(),
  to: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(240),
});

/**
 * POST /api/find-time
 *
 * Find available time slots across multiple participants.
 *
 * Rules:
 * - Participants must include self
 * - All other participants must be viewable friends (canViewCalendar=true)
 * - Returns up to 5 suggested slots preferring earlier times
 * - Slots aligned to 15-minute increments
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Rate limit
    const rateLimitResult = await checkRateLimit(userId, FIND_TIME_RATE_LIMIT);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many requests. Try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const data = FindTimeSchema.parse(body);

    const fromDate = new Date(data.from);
    const toDate = new Date(data.to);

    if (fromDate >= toDate) {
      return NextResponse.json(
        { error: '"from" must be before "to"' },
        { status: 400 }
      );
    }

    // Deduplicate participants
    const participantIds = [...new Set(data.participantIds)];

    // Ensure self is included
    if (!participantIds.includes(userId)) {
      participantIds.push(userId);
    }

    // Check calendar permissions for all participants except self
    const notViewableParticipantIds: string[] = [];

    for (const pid of participantIds) {
      if (pid === userId) continue; // self always ok

      const permission = await getFriendCalendarPermission(pid, userId);
      if (!permission.allowed) {
        notViewableParticipantIds.push(pid);
      }
    }

    if (notViewableParticipantIds.length > 0) {
      return NextResponse.json(
        {
          error:
            'Cannot view calendar for some participants. They must be accepted friends with calendar sharing enabled.',
          notViewableParticipantIds,
        },
        { status: 403 }
      );
    }

    const range: Interval = {
      start: fromDate.getTime(),
      end: toDate.getTime(),
    };
    const durationMs = data.durationMinutes * 60 * 1000;

    // Query busy intervals for each participant
    const participantsFree: Interval[][] = [];

    for (const pid of participantIds) {
      // Get all events where the participant is owner or attendee (not DECLINED)
      const events = await prisma.event.findMany({
        where: {
          startAt: { lt: toDate },
          endAt: { gt: fromDate },
          OR: [
            { ownerId: pid },
            {
              attendees: {
                some: {
                  userId: pid,
                  status: { not: 'DECLINED' },
                },
              },
            },
          ],
        },
        select: {
          startAt: true,
          endAt: true,
        },
      });

      const busyIntervals: Interval[] = events.map((e) => ({
        start: e.startAt.getTime(),
        end: e.endAt.getTime(),
      }));

      const merged = mergeIntervals(busyIntervals);
      const free = invertToFree(merged, range);
      participantsFree.push(free);
    }

    // Intersect all free intervals
    const commonFree = intersectFree(participantsFree);

    // Pick slots
    const slots = pickSlots(commonFree, durationMs, 5);

    return NextResponse.json({
      slots: slots.map((s) => ({
        startAt: new Date(s.start).toISOString(),
        endAt: new Date(s.end).toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.errors },
        { status: 400 }
      );
    }
    console.error('[POST /api/find-time]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
