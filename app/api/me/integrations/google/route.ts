import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { googleIntegrationUpdateSchema } from '@/lib/validators/settings';
import { z } from 'zod';

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { pushToGoogleEnabled } = googleIntegrationUpdateSchema.parse(body);

    const connection = await prisma.googleCalendarConnection.upsert({
      where: { userId: session.user.id },
      update: { pushEnabled: pushToGoogleEnabled },
      create: {
        userId: session.user.id,
        pushEnabled: pushToGoogleEnabled,
      },
    });

    return NextResponse.json({
      pushToGoogleEnabled: connection.pushEnabled,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('[PATCH /api/me/integrations/google]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
