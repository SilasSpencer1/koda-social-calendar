/**
 * POST /api/integrations/google/sync
 *
 * Manual sync endpoint — authenticated user triggers a full bidirectional
 * sync with Google Calendar.
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { syncAll } from '@/lib/google/sync';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Verify Google account is connected
    const account = await prisma.account.findFirst({
      where: { userId, provider: 'google' },
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Google account not connected' },
        { status: 400 }
      );
    }

    const summary = await syncAll(userId);

    return NextResponse.json(summary);
  } catch (error) {
    console.error('[POST /api/integrations/google/sync]', error);
    return NextResponse.json(
      { error: 'Sync failed', message: (error as Error).message },
      { status: 500 }
    );
  }
}
