import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { isBlocked } from '@/lib/policies/friendship';

const updateSharingSchema = z.object({
  canViewCalendar: z.boolean().optional(),
  detailLevel: z.enum(['BUSY_ONLY', 'DETAILS']).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const friendshipId = (await params).id;

    // Get the friendship
    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
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

    // Determine who is the owner and who is the friend
    const isRequester = friendship.requesterId === userId;
    const isAddressee = friendship.addresseeId === userId;

    if (!isRequester && !isAddressee) {
      return NextResponse.json(
        { error: 'Unauthorized: not involved in this friendship' },
        { status: 403 }
      );
    }

    // Must be accepted friends
    if (friendship.status !== 'ACCEPTED') {
      return NextResponse.json(
        { error: 'Friendship must be accepted' },
        { status: 400 }
      );
    }

    // Parse body
    const body = await req.json();
    const validationResult = updateSharingSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error },
        { status: 400 }
      );
    }

    const { canViewCalendar, detailLevel } = validationResult.data;

    // Check if blocked
    const friendId = isRequester
      ? friendship.addresseeId
      : friendship.requesterId;
    const blocked = await isBlocked(userId, friendId);
    if (blocked) {
      return NextResponse.json(
        { error: 'Cannot update sharing settings: blocked' },
        { status: 403 }
      );
    }

    // Update the friendship
    const updated = await prisma.friendship.update({
      where: { id: friendshipId },
      data: {
        ...(canViewCalendar !== undefined && { canViewCalendar }),
        ...(detailLevel !== undefined && { detailLevel }),
      },
      select: {
        canViewCalendar: true,
        detailLevel: true,
      },
    });

    return NextResponse.json({
      ok: true,
      sharing: {
        canViewCalendar: updated.canViewCalendar,
        detailLevel: updated.detailLevel,
      },
    });
  } catch (error) {
    console.error('Error updating sharing settings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
