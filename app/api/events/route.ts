import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import type { EventVisibility, CoverMode } from '@prisma/client';

// Force Node.js runtime to support all database operations
export const runtime = 'nodejs';

const CreateEventSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  locationName: z.string().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  timezone: z.string().default('UTC'),
  visibility: z.enum(['PRIVATE', 'FRIENDS', 'PUBLIC']).default('PRIVATE'),
  coverMode: z.enum(['NONE', 'BUSY_ONLY']).default('NONE'),
  syncToGoogle: z.boolean().default(false),
});

const QuerySchema = z.object({
  from: z
    .string()
    .datetime()
    .nullish()
    .transform((v) => v ?? undefined),
  to: z
    .string()
    .datetime()
    .nullish()
    .transform((v) => v ?? undefined),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = QuerySchema.parse({
      from: searchParams.get('from'),
      to: searchParams.get('to'),
    });

    // Include events the user owns OR is attending/invited to (exclude DECLINED)
    const where: Record<string, unknown> = {
      OR: [
        { ownerId: session.user.id },
        {
          attendees: {
            some: {
              userId: session.user.id,
              status: { not: 'DECLINED' },
            },
          },
        },
      ],
    };

    if (query.from || query.to) {
      where.AND = [];
      if (query.from) {
        (where.AND as unknown[]).push({ endAt: { gte: new Date(query.from) } });
      }
      if (query.to) {
        (where.AND as unknown[]).push({ startAt: { lte: new Date(query.to) } });
      }
    }

    const events = await prisma.event.findMany({
      where,
      include: {
        attendees: {
          select: {
            id: true,
            userId: true,
            status: true,
            anonymity: true,
            role: true,
          },
        },
      },
      orderBy: { startAt: 'asc' },
    });

    return NextResponse.json(events);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      );
    }
    console.error('[GET /api/events] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = CreateEventSchema.parse(body);

    // Validate endAt > startAt
    const startTime = new Date(data.startAt);
    const endTime = new Date(data.endAt);
    if (endTime <= startTime) {
      return NextResponse.json(
        { error: 'Event end time must be after start time' },
        { status: 400 }
      );
    }

    // Create event with owner as HOST attendee
    const event = await prisma.event.create({
      data: {
        ownerId: session.user.id,
        title: data.title,
        description: data.description || null,
        locationName: data.locationName || null,
        startAt: startTime,
        endAt: endTime,
        timezone: data.timezone,
        visibility: data.visibility as EventVisibility,
        coverMode: data.coverMode as CoverMode,
        syncToGoogle: data.syncToGoogle,
        attendees: {
          create: {
            userId: session.user.id,
            role: 'HOST',
            status: 'GOING',
            anonymity: 'NAMED',
          },
        },
      },
      include: {
        attendees: {
          select: {
            id: true,
            userId: true,
            status: true,
            anonymity: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.errors },
        { status: 400 }
      );
    }
    console.error('[POST /api/events]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
