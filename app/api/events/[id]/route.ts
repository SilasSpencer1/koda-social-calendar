import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { isAttendeeAnonymous } from '@/lib/policies/eventAccess';
import type { EventVisibility, CoverMode } from '@prisma/client';

const UpdateEventSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  locationName: z.string().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  timezone: z.string().optional(),
  visibility: z.enum(['PRIVATE', 'FRIENDS', 'PUBLIC']).optional(),
  coverMode: z.enum(['NONE', 'BUSY_ONLY']).optional(),
  syncToGoogle: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        attendees: {
          select: {
            id: true,
            userId: true,
            status: true,
            anonymity: true,
            role: true,
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Check authorization
    const isOwner = event.ownerId === session.user?.id;
    const isAttendee = event.attendees.some(
      (a) => a.userId === session.user?.id
    );

    if (!isOwner && !isAttendee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Redact attendee list based on anonymity
    const redactedAttendees = event.attendees.map((attendee) => {
      if (
        isAttendeeAnonymous(attendee.anonymity) &&
        !isOwner &&
        attendee.userId !== session.user?.id
      ) {
        return {
          id: attendee.id,
          userId: null,
          name: 'Anonymous attendee',
          email: null,
          status: attendee.status,
          role: attendee.role,
        };
      }
      return {
        id: attendee.id,
        userId: attendee.userId,
        name: attendee.user.name,
        email: attendee.user.email,
        status: attendee.status,
        role: attendee.role,
      };
    });

    return NextResponse.json({
      ...event,
      attendees: redactedAttendees,
    });
  } catch (error) {
    console.error('[GET /api/events/:id]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const event = await prisma.event.findUnique({
      where: { id },
      select: { ownerId: true, startAt: true, endAt: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Only owner can update
    if (event.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const data = UpdateEventSchema.parse(body);

    // Validate endAt > startAt if both provided
    if (data.startAt && data.endAt) {
      if (new Date(data.endAt) <= new Date(data.startAt)) {
        return NextResponse.json(
          { error: 'Event end time must be after start time' },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.event.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        locationName: data.locationName,
        startAt: data.startAt ? new Date(data.startAt) : undefined,
        endAt: data.endAt ? new Date(data.endAt) : undefined,
        timezone: data.timezone,
        visibility: data.visibility as EventVisibility | undefined,
        coverMode: data.coverMode as CoverMode | undefined,
        syncToGoogle: data.syncToGoogle,
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

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.errors },
        { status: 400 }
      );
    }
    console.error('[PATCH /api/events/:id]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const event = await prisma.event.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Only owner can delete
    if (event.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await prisma.event.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/events/:id]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
