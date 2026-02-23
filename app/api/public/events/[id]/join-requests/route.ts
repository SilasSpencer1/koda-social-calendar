import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/public/events/:id/join-requests
 *
 * List join requests for a public event.
 * Only the host (event owner) can access this endpoint.
 */
export async function GET(
  _request: NextRequest,
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
      select: { ownerId: true, visibility: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Must be PUBLIC event
    if (event.visibility !== 'PUBLIC') {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Only host
    if (event.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const joinRequests = await prisma.joinRequest.findMany({
      where: { eventId: id },
      include: {
        requester: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(joinRequests);
  } catch (error) {
    console.error('[GET /api/public/events/:id/join-requests]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
