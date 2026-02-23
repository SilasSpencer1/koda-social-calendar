/**
 * POST /api/jobs/sync-google
 *
 * Scheduled job endpoint for Google Calendar sync.
 * Secured by CRON_SECRET header — intended to be called from GitHub Actions.
 *
 * Batches users: processes up to 20 users per invocation to avoid timeouts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { syncAll } from '@/lib/google/sync';

export const runtime = 'nodejs';

const BATCH_SIZE = 20;

export async function POST(request: NextRequest) {
  try {
    // Verify CRON_SECRET
    const cronSecret = request.headers.get('x-cron-secret');
    if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find users with Google accounts and sync enabled
    const connections = await prisma.googleCalendarConnection.findMany({
      where: { isEnabled: true },
      include: {
        user: {
          include: {
            accounts: {
              where: { provider: 'google' },
              select: { id: true },
            },
          },
        },
      },
      orderBy: { lastSyncedAt: 'asc' }, // oldest sync first
      take: BATCH_SIZE,
    });

    // Also include users who have a Google account but no connection record yet
    const connectedUserIds = connections.map(
      (c: { userId: string }) => c.userId
    );
    const unregisteredAccounts = await prisma.account.findMany({
      where: {
        provider: 'google',
        userId: { notIn: connectedUserIds },
      },
      select: { userId: true },
      take: BATCH_SIZE - connections.length,
    });

    const allUserIds = [
      ...connectedUserIds,
      ...unregisteredAccounts.map((a) => a.userId),
    ];

    const results: { userId: string; summary: object; success: boolean }[] = [];

    for (const userId of allUserIds) {
      try {
        const summary = await syncAll(userId);
        results.push({ userId, summary, success: true });
      } catch (err) {
        results.push({
          userId,
          summary: { error: (err as Error).message },
          success: false,
        });
      }
    }

    return NextResponse.json({
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('[POST /api/jobs/sync-google]', error);
    return NextResponse.json(
      { error: 'Job failed', message: (error as Error).message },
      { status: 500 }
    );
  }
}
