import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Get the friendship
    const friendship = await prisma.friendship.findUnique({
      where: { id },
      select: {
        id: true,
        requesterId: true,
        addresseeId: true,
        status: true,
        canViewCalendar: true,
        detailLevel: true,
      },
    });

    if (!friendship) {
      return NextResponse.json(
        { error: 'Friendship not found' },
        { status: 404 }
      );
    }

    // Only participants can view
    if (
      friendship.requesterId !== session.user.id &&
      friendship.addresseeId !== session.user.id
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    return NextResponse.json(friendship);
  } catch (error) {
    console.error('Error fetching friendship:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Get the friendship
    const friendship = await prisma.friendship.findUnique({
      where: { id },
    });

    if (!friendship) {
      return NextResponse.json(
        { error: 'Friendship not found' },
        { status: 404 }
      );
    }

    // Only participants can unfriend
    if (
      friendship.requesterId !== session.user.id &&
      friendship.addresseeId !== session.user.id
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Can only unfriend accepted friendships
    if (friendship.status !== 'ACCEPTED') {
      return NextResponse.json(
        { error: 'Can only unfriend accepted friendships' },
        { status: 400 }
      );
    }

    // Delete the friendship
    await prisma.friendship.delete({
      where: { id },
    });

    return NextResponse.json(
      { message: 'Unfriended successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error unfriending:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
