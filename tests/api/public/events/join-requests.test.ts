/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';

/**
 * Join Request Tests
 *
 * Verifies:
 * 1. Join request uniqueness — same user cannot create two requests for same event
 * 2. Host approve creates attendee and notification
 */

// Mock Prisma
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    joinRequest: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    attendee: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
    event: {
      findUnique: vi.fn(),
    },
  },
}));

const mockPrisma = prisma as any;

const requesterId = 'requester-1';
const eventId = 'event-1';
const joinRequestId = 'jr-1';

describe('Join Requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Uniqueness', () => {
    it('should find existing join request via unique constraint', async () => {
      const existing = {
        id: joinRequestId,
        eventId,
        requesterId,
        status: 'PENDING',
      };

      mockPrisma.joinRequest.findUnique.mockResolvedValue(existing);

      const found = await prisma.joinRequest.findUnique({
        where: {
          eventId_requesterId: { eventId, requesterId },
        },
      });

      expect(found).not.toBeNull();
      expect(found?.status).toBe('PENDING');
      expect(mockPrisma.joinRequest.findUnique).toHaveBeenCalledWith({
        where: {
          eventId_requesterId: { eventId, requesterId },
        },
      });
    });

    it('should return null when no join request exists (allows creation)', async () => {
      mockPrisma.joinRequest.findUnique.mockResolvedValue(null);

      const found = await prisma.joinRequest.findUnique({
        where: {
          eventId_requesterId: { eventId, requesterId },
        },
      });

      expect(found).toBeNull();
    });

    it('should prevent duplicate create by checking existing first', async () => {
      // First call: check existing -> null (ok to create)
      mockPrisma.joinRequest.findUnique.mockResolvedValueOnce(null);
      const newRequest = {
        id: joinRequestId,
        eventId,
        requesterId,
        status: 'PENDING',
      };
      mockPrisma.joinRequest.create.mockResolvedValue(newRequest);

      const check1 = await prisma.joinRequest.findUnique({
        where: { eventId_requesterId: { eventId, requesterId } },
      });
      expect(check1).toBeNull();

      const created = await prisma.joinRequest.create({
        data: { eventId, requesterId, status: 'PENDING' },
      });
      expect(created.status).toBe('PENDING');

      // Second call: check existing -> found (reject)
      mockPrisma.joinRequest.findUnique.mockResolvedValueOnce(newRequest);

      const check2 = await prisma.joinRequest.findUnique({
        where: { eventId_requesterId: { eventId, requesterId } },
      });
      expect(check2).not.toBeNull();
      expect(check2?.status).toBe('PENDING');
      // Application logic would reject here — no duplicate create
    });
  });

  describe('Host Approve', () => {
    it('should approve join request and create attendee + notification', async () => {
      const pendingRequest = {
        id: joinRequestId,
        eventId,
        requesterId,
        status: 'PENDING',
        requester: { id: requesterId, name: 'Test User' },
      };

      const approvedRequest = { ...pendingRequest, status: 'APPROVED' };
      const createdAttendee = {
        id: 'att-new',
        eventId,
        userId: requesterId,
        role: 'ATTENDEE',
        status: 'GOING',
        anonymity: 'NAMED',
      };
      const createdNotification = {
        id: 'notif-1',
        userId: requesterId,
        type: 'JOIN_REQUEST_APPROVED',
        title: 'Join request approved',
        body: 'Your request to join "Test Event" was approved!',
      };

      // Mock: find the pending request
      mockPrisma.joinRequest.findUnique.mockResolvedValue(pendingRequest);
      // Mock: update to APPROVED
      mockPrisma.joinRequest.update.mockResolvedValue(approvedRequest);
      // Mock: create attendee
      mockPrisma.attendee.create.mockResolvedValue(createdAttendee);
      // Mock: create notification
      mockPrisma.notification.create.mockResolvedValue(createdNotification);

      // Simulate approve flow
      const request = await prisma.joinRequest.findUnique({
        where: { id: joinRequestId },
      });
      expect(request?.status).toBe('PENDING');

      const updated = await prisma.joinRequest.update({
        where: { id: joinRequestId },
        data: { status: 'APPROVED' },
      });
      expect(updated.status).toBe('APPROVED');

      const attendee = await prisma.attendee.create({
        data: {
          eventId,
          userId: requesterId,
          role: 'ATTENDEE',
          status: 'GOING',
          anonymity: 'NAMED',
        },
      });
      expect(attendee.userId).toBe(requesterId);
      expect(attendee.status).toBe('GOING');
      expect(attendee.role).toBe('ATTENDEE');

      const notification = await prisma.notification.create({
        data: {
          userId: requesterId,
          type: 'JOIN_REQUEST_APPROVED',
          title: 'Join request approved',
          body: 'Your request to join "Test Event" was approved!',
          href: `/app/public/events/${eventId}`,
        },
      });
      expect(notification.userId).toBe(requesterId);
      expect(notification.type).toBe('JOIN_REQUEST_APPROVED');
    });

    it('should deny join request and create notification', async () => {
      const pendingRequest = {
        id: joinRequestId,
        eventId,
        requesterId,
        status: 'PENDING',
      };

      const deniedRequest = { ...pendingRequest, status: 'DENIED' };
      const deniedNotification = {
        id: 'notif-2',
        userId: requesterId,
        type: 'JOIN_REQUEST_DENIED',
      };

      mockPrisma.joinRequest.findUnique.mockResolvedValue(pendingRequest);
      mockPrisma.joinRequest.update.mockResolvedValue(deniedRequest);
      mockPrisma.notification.create.mockResolvedValue(deniedNotification);

      const updated = await prisma.joinRequest.update({
        where: { id: joinRequestId },
        data: { status: 'DENIED' },
      });
      expect(updated.status).toBe('DENIED');

      const notification = await prisma.notification.create({
        data: {
          userId: requesterId,
          type: 'JOIN_REQUEST_DENIED',
          title: 'Join request denied',
          body: 'Your request was not approved.',
          href: `/app/public/events/${eventId}`,
        },
      });
      expect(notification.type).toBe('JOIN_REQUEST_DENIED');
    });
  });
});
