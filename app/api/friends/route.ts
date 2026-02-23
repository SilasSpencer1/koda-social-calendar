import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  try {
    // Authenticate
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all friendships (accepted, pending, etc.) for the user
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: session.user.id },
          { addresseeId: session.user.id },
        ],
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true,
          },
        },
        addressee: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Organize into categories
    const accepted: typeof friendships = [];
    const incomingPending: typeof friendships = [];
    const outgoingPending: typeof friendships = [];

    const currentUserId = session.user.id;

    for (const friendship of friendships) {
      if (friendship.status === 'BLOCKED') {
        // Don't include blocked in results
        continue;
      }

      if (friendship.status === 'ACCEPTED') {
        accepted.push(friendship);
      } else if (friendship.status === 'PENDING') {
        if (friendship.addresseeId === currentUserId) {
          // User is the addressee - this is incoming
          incomingPending.push(friendship);
        } else {
          // User is the requester - this is outgoing
          outgoingPending.push(friendship);
        }
      }
    }

    // Format response
    const formatFriendship = (
      f: (typeof friendships)[0],
      perspective: 'requester' | 'addressee'
    ) => {
      const otherUser = perspective === 'requester' ? f.addressee : f.requester;
      return {
        id: f.id,
        user: otherUser,
        status: f.status,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        canViewCalendar: f.canViewCalendar,
        detailLevel: f.detailLevel,
      };
    };

    return NextResponse.json({
      accepted: accepted.map((f) =>
        formatFriendship(
          f,
          f.requesterId === currentUserId ? 'requester' : 'addressee'
        )
      ),
      incomingPending: incomingPending.map((f) =>
        formatFriendship(f, 'addressee')
      ),
      outgoingPending: outgoingPending.map((f) =>
        formatFriendship(f, 'requester')
      ),
    });
  } catch (error) {
    console.error('Error fetching friends:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
