import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { privacyUpdateSchema } from '@/lib/validators/settings';
import { z } from 'zod';

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const data = privacyUpdateSchema.parse(body);

    const settings = await prisma.settings.upsert({
      where: { userId: session.user.id },
      update: {
        accountVisibility: data.accountVisibility,
        defaultDetailLevel: data.defaultDetailLevel,
        allowSuggestions: data.allowSuggestions,
      },
      create: {
        userId: session.user.id,
        accountVisibility: data.accountVisibility,
        defaultDetailLevel: data.defaultDetailLevel,
        allowSuggestions: data.allowSuggestions,
      },
    });

    return NextResponse.json({
      accountVisibility: settings.accountVisibility,
      defaultDetailLevel: settings.defaultDetailLevel,
      allowSuggestions: settings.allowSuggestions,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('[PATCH /api/me/privacy]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
