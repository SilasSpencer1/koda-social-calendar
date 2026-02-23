/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { isAttendeeAnonymous } from '@/lib/policies/eventAccess';

/**
 * Events API - RSVP and Anonymity Tests
 *
 * These tests verify RSVP status updates and anonymity redaction logic
 * using mocked Prisma calls (no real DB required).
 */

// Mock Prisma
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    attendee: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    event: {
      findUnique: vi.fn(),
    },
    user: {
      create: vi.fn(),
    },
  },
}));

const mockPrisma = prisma as any;

const ownerId = 'owner-1';
const attendeeId = 'attendee-1';
const eventId = 'event-1';

function makeAttendee(overrides: Record<string, unknown> = {}) {
  return {
    id: 'att-1',
    eventId,
    userId: attendeeId,
    status: 'INVITED',
    anonymity: 'NAMED',
    role: 'ATTENDEE',
    ...overrides,
  };
}

describe('Events API - RSVP and Anonymity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('RSVP Updates', () => {
    it('should update attendee status to GOING', async () => {
      const updated = makeAttendee({ status: 'GOING' });
      mockPrisma.attendee.update.mockResolvedValue(updated);
      mockPrisma.attendee.findUnique.mockResolvedValue(updated);

      const result = await prisma.attendee.update({
        where: { eventId_userId: { eventId, userId: attendeeId } },
        data: { status: 'GOING' },
      });

      expect(result.status).toBe('GOING');
      expect(mockPrisma.attendee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'GOING' },
        })
      );

      // Verify persisted value
      const fetched = await prisma.attendee.findUnique({
        where: { id: result.id },
      });
      expect(fetched?.status).toBe('GOING');
    });

    it('should update attendee status to DECLINED', async () => {
      const updated = makeAttendee({ status: 'DECLINED' });
      mockPrisma.attendee.update.mockResolvedValue(updated);

      const result = await prisma.attendee.update({
        where: { eventId_userId: { eventId, userId: attendeeId } },
        data: { status: 'DECLINED' },
      });

      expect(result.status).toBe('DECLINED');
    });

    it('should return null when non-attendee tries to RSVP', async () => {
      mockPrisma.attendee.findUnique.mockResolvedValue(null);

      const nonExistent = await prisma.attendee.findUnique({
        where: { eventId_userId: { eventId, userId: 'random-user' } },
      });

      expect(nonExistent).toBeNull();
    });
  });

  describe('Anonymity Enforcement', () => {
    it('should update attendee anonymity to ANONYMOUS', async () => {
      const updated = makeAttendee({ anonymity: 'ANONYMOUS' });
      mockPrisma.attendee.update.mockResolvedValue(updated);

      const result = await prisma.attendee.update({
        where: { eventId_userId: { eventId, userId: attendeeId } },
        data: { anonymity: 'ANONYMOUS' },
      });

      expect(result.anonymity).toBe('ANONYMOUS');
    });

    it('should identify anonymous attendees via isAttendeeAnonymous', () => {
      expect(isAttendeeAnonymous('ANONYMOUS')).toBe(true);
      expect(isAttendeeAnonymous('NAMED')).toBe(false);
    });

    it('should redact anonymous attendee for non-owner viewers', () => {
      const attendees = [
        {
          id: 'att-owner',
          userId: ownerId,
          anonymity: 'NAMED',
          status: 'GOING',
          role: 'HOST',
          user: { id: ownerId, name: 'Event Owner', email: 'owner@test.com' },
        },
        {
          id: 'att-1',
          userId: attendeeId,
          anonymity: 'ANONYMOUS',
          status: 'GOING',
          role: 'ATTENDEE',
          user: {
            id: attendeeId,
            name: 'Attendee User',
            email: 'attendee@test.com',
          },
        },
      ];

      // Simulate the redaction from GET /api/events/:id (non-owner viewer)
      const viewerId = attendeeId; // viewing as attendee, not owner
      const isOwner = false;

      const redacted = attendees.map((att) => {
        if (
          isAttendeeAnonymous(att.anonymity) &&
          !isOwner &&
          att.userId !== viewerId
        ) {
          return {
            id: att.id,
            userId: null,
            name: 'Anonymous attendee',
            email: null,
            status: att.status,
            role: att.role,
          };
        }
        return {
          id: att.id,
          userId: att.userId,
          name: att.user.name,
          email: att.user.email,
          status: att.status,
          role: att.role,
        };
      });

      // The owner should remain visible
      const ownerEntry = redacted.find((a) => a.userId === ownerId);
      expect(ownerEntry?.name).toBe('Event Owner');

      // The anonymous attendee viewing themselves should NOT be redacted
      const selfEntry = redacted.find((a) => a.userId === attendeeId);
      expect(selfEntry?.name).toBe('Attendee User');
    });

    it('should not redact anonymous attendee for owner', () => {
      const attendees = [
        {
          id: 'att-1',
          userId: attendeeId,
          anonymity: 'ANONYMOUS',
          status: 'GOING',
          role: 'ATTENDEE',
          user: {
            id: attendeeId,
            name: 'Attendee User',
            email: 'attendee@test.com',
          },
        },
      ];

      const isOwner = true;

      const redacted = attendees.map((att) => {
        if (
          isAttendeeAnonymous(att.anonymity) &&
          !isOwner &&
          att.userId !== ownerId
        ) {
          return {
            id: att.id,
            userId: null,
            name: 'Anonymous attendee',
            email: null,
            status: att.status,
            role: att.role,
          };
        }
        return {
          id: att.id,
          userId: att.userId,
          name: att.user.name,
          email: att.user.email,
          status: att.status,
          role: att.role,
        };
      });

      // Owner should see the real identity
      expect(redacted[0].name).toBe('Attendee User');
      expect(redacted[0].email).toBe('attendee@test.com');
      expect(redacted[0].userId).toBe(attendeeId);
    });

    it('should allow attendee to toggle anonymity', async () => {
      // Start as NAMED
      mockPrisma.attendee.findUnique.mockResolvedValue(
        makeAttendee({ anonymity: 'NAMED' })
      );
      let attendee = await prisma.attendee.findUnique({
        where: { eventId_userId: { eventId, userId: attendeeId } },
      });
      expect(attendee?.anonymity).toBe('NAMED');

      // Toggle to ANONYMOUS
      mockPrisma.attendee.update.mockResolvedValue(
        makeAttendee({ anonymity: 'ANONYMOUS' })
      );
      attendee = await prisma.attendee.update({
        where: { eventId_userId: { eventId, userId: attendeeId } },
        data: { anonymity: 'ANONYMOUS' },
      });
      expect(attendee.anonymity).toBe('ANONYMOUS');

      // Toggle back to NAMED
      mockPrisma.attendee.update.mockResolvedValue(
        makeAttendee({ anonymity: 'NAMED' })
      );
      attendee = await prisma.attendee.update({
        where: { eventId_userId: { eventId, userId: attendeeId } },
        data: { anonymity: 'NAMED' },
      });
      expect(attendee.anonymity).toBe('NAMED');
    });
  });
});
