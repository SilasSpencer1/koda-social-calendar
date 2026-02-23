import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

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

    const { id: targetUserId } = await params;

    // Find the block relationship
    const blockRelationship = await prisma.friendship.findFirst({
      where: {
        requesterId: session.user.id,
        addresseeId: targetUserId,
        status: 'BLOCKED',
      },
    });

    if (!blockRelationship) {
      return NextResponse.json(
        { error: 'User is not blocked' },
        { status: 404 }
      );
    }

    // Delete the block
    await prisma.friendship.delete({
      where: { id: blockRelationship.id },
    });

    return NextResponse.json(
      { message: 'User unblocked successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error unblocking user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
