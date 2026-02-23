/**
 * GET/PATCH /api/integrations/google/connection
 *
 * Manages the GoogleCalendarConnection preferences (push toggle, sync window).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const connection = await prisma.googleCalendarConnection.findUnique({
      where: { userId: session.user.id },
    });

    // Check if Google account exists
    const account = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: 'google' },
      select: { id: true },
    });

    return NextResponse.json({
      isConnected: !!account,
      connection: connection
        ? {
            isEnabled: connection.isEnabled,
            pushEnabled: connection.pushEnabled,
            lastSyncedAt: connection.lastSyncedAt,
            syncWindowPastDays: connection.syncWindowPastDays,
            syncWindowFutureDays: connection.syncWindowFutureDays,
          }
        : null,
    });
  } catch (error) {
    console.error('[GET /api/integrations/google/connection]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

const UpdateSchema = z.object({
  isEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  syncWindowPastDays: z.number().int().min(1).max(365).optional(),
  syncWindowFutureDays: z.number().int().min(1).max(365).optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = UpdateSchema.parse(body);

    const connection = await prisma.googleCalendarConnection.upsert({
      where: { userId: session.user.id },
      update: data,
      create: {
        userId: session.user.id,
        ...data,
      },
    });

    return NextResponse.json({
      isEnabled: connection.isEnabled,
      pushEnabled: connection.pushEnabled,
      lastSyncedAt: connection.lastSyncedAt,
      syncWindowPastDays: connection.syncWindowPastDays,
      syncWindowFutureDays: connection.syncWindowFutureDays,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.errors },
        { status: 400 }
      );
    }
    console.error('[PATCH /api/integrations/google/connection]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
