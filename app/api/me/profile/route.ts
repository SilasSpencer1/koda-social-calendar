import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { profileUpdateSchema } from '@/lib/validators/settings';
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

    const data = profileUpdateSchema.parse(body);

    // Check username uniqueness if provided
    if (data.username) {
      const existing = await prisma.user.findUnique({
        where: { username: data.username },
      });
      if (existing && existing.id !== session.user.id) {
        return NextResponse.json(
          { error: 'Username is already taken', field: 'username' },
          { status: 409 }
        );
      }
    }

    // Only update fields that were explicitly provided
    const updateData: Record<string, unknown> = { name: data.name };
    if (data.username !== undefined) {
      updateData.username = data.username ?? null;
    }
    if (data.city !== undefined) {
      updateData.city = data.city ?? null;
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        avatarUrl: true,
        city: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('[PATCH /api/me/profile]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
