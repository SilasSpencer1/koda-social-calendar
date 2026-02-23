import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const session = await getSession();

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Defensive check: ensure user.id exists
    if (!session.user.id) {
      console.error('Session user missing id property');
      return NextResponse.json(
        { error: 'Invalid session state' },
        { status: 500 }
      );
    }

    // Delete Google Account for this user
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: 'google',
      },
    });

    if (account) {
      // TODO: Call Google revoke endpoint if refresh_token is available
      // This would require calling Google's token revocation endpoint to revoke the tokens
      // For now, we just delete the account record (tokens become invalid after deletion)
      // https://developers.google.com/identity/protocols/oauth2/web-server#offline

      await prisma.account.delete({
        where: {
          id: account.id,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Disconnect error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
