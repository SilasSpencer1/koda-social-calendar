import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';

const respondSchema = z.object({
  action: z.enum(['accept', 'decline']),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Parse and validate request body
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const result = respondSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { action } = result.data;

    // Get the friendship request
    const friendship = await prisma.friendship.findUnique({
      where: { id },
      include: {
        requester: {
          select: { id: true, name: true, username: true, avatarUrl: true },
        },
        addressee: {
          select: { id: true, name: true, username: true, avatarUrl: true },
        },
      },
    });

    if (!friendship) {
      return NextResponse.json(
        { error: 'Friend request not found' },
        { status: 404 }
      );
    }

    // Only the addressee can respond
    if (friendship.addresseeId !== session.user.id) {
      return NextResponse.json(
        { error: 'Only the recipient can respond to this request' },
        { status: 403 }
      );
    }

    // Can only respond to pending requests
    if (friendship.status !== 'PENDING') {
      return NextResponse.json(
        { error: `Cannot respond to ${friendship.status} request` },
        { status: 400 }
      );
    }

    // Update friendship status
    const newStatus = action === 'accept' ? 'ACCEPTED' : 'DECLINED';

    const updated = await prisma.friendship.update({
      where: { id },
      data: {
        status: newStatus,
        // Grant calendar access when accepting friendship
        ...(newStatus === 'ACCEPTED' && { canViewCalendar: true }),
      },
      include: {
        requester: {
          select: { id: true, name: true, username: true, avatarUrl: true },
        },
        addressee: {
          select: { id: true, name: true, username: true, avatarUrl: true },
        },
      },
    });

    return NextResponse.json(
      {
        id: updated.id,
        requester: updated.requester,
        addressee: updated.addressee,
        status: updated.status,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error responding to friend request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
