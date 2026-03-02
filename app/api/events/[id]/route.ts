import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { isAttendeeAnonymous } from '@/lib/policies/eventAccess';
import type { EventVisibility, CoverMode } from '@prisma/client';
import {
  sendEventUpdatedEmail,
  sendEventCancelledEmail,
  isEmailEnabledForUser,
} from '@/lib/email';

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

    // Notify GOING attendees if material fields changed (time/location)
    const materialFieldsChanged =
      data.startAt !== undefined ||
      data.endAt !== undefined ||
      data.locationName !== undefined ||
      data.timezone !== undefined;

    if (materialFieldsChanged) {
      const goingAttendees = await prisma.attendee.findMany({
        where: {
          eventId: id,
          status: 'GOING',
          userId: { not: session.user.id },
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      for (const att of goingAttendees) {
        isEmailEnabledForUser(att.user.id).then((enabled) => {
          if (!enabled) return;
          sendEventUpdatedEmail({
            to: att.user.email,
            attendeeName: att.user.name || 'there',
            eventTitle: updated.title,
            eventStartAt: updated.startAt,
            eventTimezone: updated.timezone,
            locationName: updated.locationName,
            eventId: updated.id,
          }).catch((err) =>
            console.error('[EMAIL] event update notification failed:', err)
          );
        });
      }
    }

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

    // Fetch event with attendees BEFORE deleting (cascade removes them)
    const event = await prisma.event.findUnique({
      where: { id },
      select: {
        ownerId: true,
        title: true,
        startAt: true,
        timezone: true,
        owner: { select: { name: true } },
        attendees: {
          where: { userId: { not: undefined } },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Only owner can delete
    if (event.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Collect attendees to notify before deletion
    const attendeesToNotify = event.attendees.filter(
      (a) => a.userId !== session.user!.id
    );

    await prisma.event.delete({
      where: { id },
    });

    // Fire-and-forget cancellation emails
    for (const att of attendeesToNotify) {
      isEmailEnabledForUser(att.user.id).then((enabled) => {
        if (!enabled) return;
        sendEventCancelledEmail({
          to: att.user.email,
          attendeeName: att.user.name || 'there',
          hostName: event.owner.name || 'The host',
          eventTitle: event.title,
          eventStartAt: event.startAt,
          eventTimezone: event.timezone,
        }).catch((err) =>
          console.error('[EMAIL] cancellation notification failed:', err)
        );
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/events/:id]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
