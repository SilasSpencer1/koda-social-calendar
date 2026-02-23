import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import {
  getFriendCalendarPermission,
  filterEventsForViewer,
} from '@/lib/policies/calendarAccess';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ friendId: string }> }
) {
  try {
    // Authenticate
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const viewerId = session.user.id;
    const ownerId = (await params).friendId;

    // Validate that owner exists
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true },
    });

    if (!owner) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check calendar permission
    const permission = await getFriendCalendarPermission(ownerId, viewerId);
    if (!permission.allowed) {
      // Return 403 to avoid revealing whether the user/friendship exists
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Parse date range from query params
    const searchParams = req.nextUrl.searchParams;
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    if (!fromParam || !toParam) {
      return NextResponse.json(
        { error: 'Missing required query parameters: from, to (ISO format)' },
        { status: 400 }
      );
    }

    let from: Date;
    let to: Date;

    try {
      from = new Date(fromParam);
      to = new Date(toParam);

      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        throw new Error('Invalid date');
      }

      if (from >= to) {
        return NextResponse.json(
          { error: 'from must be before to' },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        {
          error:
            'Invalid date format. Use ISO format (e.g., 2026-02-05T00:00:00Z)',
        },
        { status: 400 }
      );
    }

    // Fetch events in the date range
    const events = await prisma.event.findMany({
      where: {
        ownerId,
        startAt: {
          gte: from,
          lt: to,
        },
      },
      select: {
        id: true,
        title: true,
        startAt: true,
        endAt: true,
        locationName: true,
        visibility: true,
      },
      orderBy: { startAt: 'asc' },
    });

    // Filter and redact based on permission
    const redactedEvents = filterEventsForViewer(events, permission);

    return NextResponse.json({
      events: redactedEvents,
      permission: {
        allowed: permission.allowed,
        detailLevel: permission.detailLevel,
      },
    });
  } catch (error) {
    console.error('Error fetching friend calendar:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
