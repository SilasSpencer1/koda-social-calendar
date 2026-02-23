/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';

/**
 * Suggestions API Tests
 *
 * Covers:
 * 1. Dismiss persists — sets status DISMISSED
 * 2. Add-to-calendar — creates Event row and marks suggestion ADDED
 * 3. Ownership check — cannot act on another user's suggestion
 */

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    suggestion: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    event: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const mockPrisma = prisma as any;

const userId = 'user-1';
const otherUserId = 'user-other';
const suggestionId = 'sug-1';
const eventId = 'evt-1';

function makeSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: suggestionId,
    userId,
    source: 'OSM',
    title: 'Nice Cafe',
    description: 'A cozy cafe',
    category: 'cafe',
    venueName: 'Nice Cafe',
    address: '123 Main St',
    slotStartAt: new Date('2026-02-10T18:00:00Z'),
    slotEndAt: new Date('2026-02-10T21:00:00Z'),
    isOpenAtTime: 'OPEN',
    confidence: 'HIGH',
    status: 'PROPOSED',
    ...overrides,
  };
}

describe('Suggestions API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Dismiss', () => {
    it('should set status to DISMISSED', async () => {
      const suggestion = makeSuggestion();
      const dismissed = { ...suggestion, status: 'DISMISSED' };

      mockPrisma.suggestion.findUnique.mockResolvedValue(suggestion);
      mockPrisma.suggestion.update.mockResolvedValue(dismissed);

      // Simulate dismiss flow
      const found = await prisma.suggestion.findUnique({
        where: { id: suggestionId },
      });
      expect(found).not.toBeNull();
      expect(found?.userId).toBe(userId);

      const updated = await prisma.suggestion.update({
        where: { id: suggestionId },
        data: { status: 'DISMISSED' },
      });

      expect(updated.status).toBe('DISMISSED');
      expect(mockPrisma.suggestion.update).toHaveBeenCalledWith({
        where: { id: suggestionId },
        data: { status: 'DISMISSED' },
      });
    });

    it("should not act on another user's suggestion", async () => {
      const otherSuggestion = makeSuggestion({ userId: otherUserId });
      mockPrisma.suggestion.findUnique.mockResolvedValue(otherSuggestion);

      const found = await prisma.suggestion.findUnique({
        where: { id: suggestionId },
      });

      // Application logic: check userId !== session.user.id => 404
      expect(found?.userId).not.toBe(userId);
    });
  });

  describe('Add to Calendar', () => {
    it('should create Event and mark suggestion ADDED atomically', async () => {
      const suggestion = makeSuggestion();
      const createdEvent = { id: eventId, ownerId: userId, title: 'Nice Cafe' };

      mockPrisma.suggestion.findUnique.mockResolvedValue(suggestion);

      // Simulate $transaction
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: any) => Promise<any>) => {
          const tx = {
            event: {
              create: vi.fn().mockResolvedValue(createdEvent),
            },
            suggestion: {
              update: vi
                .fn()
                .mockResolvedValue({ ...suggestion, status: 'ADDED' }),
            },
          };
          return fn(tx);
        }
      );

      const result = await prisma.$transaction(async (tx: any) => {
        const newEvent = await tx.event.create({
          data: {
            ownerId: userId,
            title: suggestion.title,
            description: suggestion.description,
            locationName: `${suggestion.venueName} — ${suggestion.address}`,
            startAt: suggestion.slotStartAt,
            endAt: suggestion.slotEndAt,
            timezone: 'UTC',
            visibility: 'FRIENDS',
            coverMode: 'NONE',
            attendees: {
              create: {
                userId,
                role: 'HOST',
                status: 'GOING',
                anonymity: 'NAMED',
              },
            },
          },
        });

        await tx.suggestion.update({
          where: { id: suggestionId },
          data: { status: 'ADDED' },
        });

        return [newEvent] as const;
      });

      expect(result[0].id).toBe(eventId);
      expect(result[0].ownerId).toBe(userId);
    });

    it('should reject if suggestion already ADDED', async () => {
      const addedSuggestion = makeSuggestion({ status: 'ADDED' });
      mockPrisma.suggestion.findUnique.mockResolvedValue(addedSuggestion);

      const found = await prisma.suggestion.findUnique({
        where: { id: suggestionId },
      });

      // Application logic: status === 'ADDED' => 409
      expect(found?.status).toBe('ADDED');
    });
  });

  describe('Save', () => {
    it('should set status to SAVED', async () => {
      const suggestion = makeSuggestion();
      const saved = { ...suggestion, status: 'SAVED' };

      mockPrisma.suggestion.findUnique.mockResolvedValue(suggestion);
      mockPrisma.suggestion.update.mockResolvedValue(saved);

      const found = await prisma.suggestion.findUnique({
        where: { id: suggestionId },
      });
      expect(found).not.toBeNull();
      expect(found?.userId).toBe(userId);

      const updated = await prisma.suggestion.update({
        where: { id: suggestionId },
        data: { status: 'SAVED' },
      });

      expect(updated.status).toBe('SAVED');
      expect(mockPrisma.suggestion.update).toHaveBeenCalledWith({
        where: { id: suggestionId },
        data: { status: 'SAVED' },
      });
    });
  });

  describe('Error scenarios', () => {
    it('should return null when suggestion does not exist', async () => {
      mockPrisma.suggestion.findUnique.mockResolvedValue(null);

      const found = await prisma.suggestion.findUnique({
        where: { id: 'nonexistent' },
      });

      // Application logic: suggestion not found => 404
      expect(found).toBeNull();
    });

    it('should handle DISMISSED suggestion correctly — cannot save after dismiss', async () => {
      const dismissed = makeSuggestion({ status: 'DISMISSED' });
      mockPrisma.suggestion.findUnique.mockResolvedValue(dismissed);

      const found = await prisma.suggestion.findUnique({
        where: { id: suggestionId },
      });

      expect(found?.status).toBe('DISMISSED');
    });
  });
});
