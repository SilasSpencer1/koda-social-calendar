/**
 * POST /api/integrations/google/disconnect
 *
 * Disconnects the user's Google account:
 * - Deletes Account row
 * - Deletes GoogleCalendarConnection
 * - Deletes GoogleEventMapping rows
 *
 * Disconnect behaviour (Option A): imported events (source=GOOGLE) are KEPT
 * but stop syncing. This is the safe default.
 */

import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Always clean up sync tables unconditionally for this user,
    // even if the Account row was already removed or never existed.
    await prisma.googleEventMapping.deleteMany({ where: { userId } });
    await prisma.googleCalendarConnection
      .delete({ where: { userId } })
      .catch(() => {}); // Ignore if doesn't exist

    // Delete Google Account row if present
    const account = await prisma.account.findFirst({
      where: { userId, provider: 'google' },
    });

    if (account) {
      await prisma.account.delete({ where: { id: account.id } });
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
