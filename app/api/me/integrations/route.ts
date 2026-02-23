import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const account = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: 'google' },
      select: { id: true },
    });

    const connection = await prisma.googleCalendarConnection.findUnique({
      where: { userId: session.user.id },
    });

    return NextResponse.json({
      googleConnected: !!account,
      pushToGoogleEnabled: connection?.pushEnabled ?? false,
      lastSyncedAt: connection?.lastSyncedAt ?? null,
    });
  } catch (error) {
    console.error('[GET /api/me/integrations]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
