import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ friendId: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { friendId } = await params;
    const userId = session.user.id;

    // Verify friendship exists and calendar is viewable
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, addresseeId: friendId },
          { requesterId: friendId, addresseeId: userId },
        ],
        status: 'ACCEPTED',
        canViewCalendar: true,
      },
    });

    if (!friendship) {
      return NextResponse.json(
        {
          error: 'Not authorized to view this calendar',
          permission: { allowed: false, detailLevel: null },
        },
        { status: 403 }
      );
    }

    const detailLevel = friendship.detailLevel;

    // Get friend info
    const friend = await prisma.user.findUnique({
      where: { id: friendId },
      select: { id: true, name: true, username: true, avatarUrl: true },
    });

    if (!friend) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Parse date range from query params
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    let startDate: Date;
    let endDate: Date;

    if (from && to) {
      startDate = new Date(from);
      endDate = new Date(to);
    } else {
      // Default to current week (Mon-Sun)
      const now = new Date();
      const day = now.getDay();
      const diffToMon = day === 0 ? -6 : 1 - day;
      startDate = new Date(now);
      startDate.setDate(now.getDate() + diffToMon);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    }

    // Fetch events
    const events = await prisma.event.findMany({
      where: {
        ownerId: friendId,
        startAt: { lte: endDate },
        endAt: { gte: startDate },
        visibility: { in: ['FRIENDS', 'PUBLIC'] },
      },
      select: {
        id: true,
        title: true,
        description: true,
        startAt: true,
        endAt: true,
        locationName: true,
        visibility: true,
      },
      orderBy: { startAt: 'asc' },
    });

    const redactedEvents = events.map((e) => ({
      id: e.id,
      title: detailLevel === 'BUSY_ONLY' ? 'Busy' : e.title,
      description: detailLevel === 'BUSY_ONLY' ? null : e.description,
      startAt: e.startAt,
      endAt: e.endAt,
      locationName: detailLevel === 'BUSY_ONLY' ? null : e.locationName,
      visibility: e.visibility,
      redacted: detailLevel === 'BUSY_ONLY',
    }));

    return NextResponse.json({
      friend,
      events: redactedEvents,
      permission: { allowed: true, detailLevel },
      weekStart: startDate.toISOString(),
    });
  } catch (error) {
    console.error('[GET /api/calendars/friends]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
