import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { isBlocked } from '@/lib/policies/friendship';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: targetUserId } = await params;

    // Cannot block self
    if (targetUserId === session.user.id) {
      return NextResponse.json(
        { error: 'Cannot block yourself' },
        { status: 400 }
      );
    }

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if already blocked
    const alreadyBlocked = await isBlocked(session.user.id, targetUserId);
    if (alreadyBlocked) {
      return NextResponse.json(
        { error: 'User is already blocked' },
        { status: 400 }
      );
    }

    // Find existing relationship in either direction
    const existingRelationship = await prisma.friendship.findFirst({
      where: {
        OR: [
          {
            requesterId: session.user.id,
            addresseeId: targetUserId,
          },
          {
            requesterId: targetUserId,
            addresseeId: session.user.id,
          },
        ],
      },
    });

    if (existingRelationship) {
      // Update existing relationship to BLOCKED
      await prisma.friendship.update({
        where: { id: existingRelationship.id },
        data: { status: 'BLOCKED' },
      });
    } else {
      // Create new blocked relationship
      // Always create from current user as requester for consistency
      await prisma.friendship.create({
        data: {
          requesterId: session.user.id,
          addresseeId: targetUserId,
          status: 'BLOCKED',
        },
      });
    }

    return NextResponse.json(
      { message: 'User blocked successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error blocking user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
