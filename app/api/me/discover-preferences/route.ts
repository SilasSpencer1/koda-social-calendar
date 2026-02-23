import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';

const UpdatePreferencesSchema = z.object({
  city: z.string().max(200).optional(),
  radiusMiles: z.number().int().min(1).max(100).optional(),
  interests: z.array(z.string().max(50)).max(20).optional(),
});

/**
 * GET /api/me/discover-preferences
 * Return the current user's discovery preferences (creates default if none).
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let prefs = await prisma.discoveryPreferences.findUnique({
      where: { userId: session.user.id },
    });

    if (!prefs) {
      // Create defaults, seeding city from user profile if available
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { city: true },
      });

      prefs = await prisma.discoveryPreferences.create({
        data: {
          userId: session.user.id,
          city: user?.city ?? '',
          radiusMiles: 10,
          interests: [],
        },
      });
    }

    return NextResponse.json(prefs);
  } catch (error) {
    console.error('[GET /api/me/discover-preferences]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/me/discover-preferences
 * Update the current user's discovery preferences.
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = UpdatePreferencesSchema.parse(body);

    // Seed city from user profile when creating new preferences (consistent with GET)
    let defaultCity = '';
    const existing = await prisma.discoveryPreferences.findUnique({
      where: { userId: session.user.id },
    });
    if (!existing && data.city === undefined) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { city: true },
      });
      defaultCity = user?.city ?? '';
    }

    const prefs = await prisma.discoveryPreferences.upsert({
      where: { userId: session.user.id },
      update: {
        ...(data.city !== undefined && { city: data.city }),
        ...(data.radiusMiles !== undefined && {
          radiusMiles: data.radiusMiles,
        }),
        ...(data.interests !== undefined && { interests: data.interests }),
      },
      create: {
        userId: session.user.id,
        city: data.city ?? defaultCity,
        radiusMiles: data.radiusMiles ?? 10,
        interests: data.interests ?? [],
      },
    });

    return NextResponse.json(prefs);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.errors },
        { status: 400 }
      );
    }
    console.error('[PATCH /api/me/discover-preferences]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
