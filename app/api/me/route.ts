import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        avatarUrl: true,
        city: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const settings = await prisma.settings.findUnique({
      where: { userId: session.user.id },
    });

    return NextResponse.json({
      user,
      settings: settings
        ? {
            accountVisibility: settings.accountVisibility,
            defaultDetailLevel: settings.defaultDetailLevel,
            allowSuggestions: settings.allowSuggestions,
            emailInvitesEnabled: settings.emailInvitesEnabled,
            emailDigestEnabled: settings.emailDigestEnabled,
          }
        : null,
    });
  } catch (error) {
    console.error('[GET /api/me]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
