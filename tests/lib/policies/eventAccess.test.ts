/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  canViewerSeeEvent,
  getViewerDetailLevel,
  redactEventForViewer,
  isAttendeeAnonymous,
} from '@/lib/policies/eventAccess';
import { prisma } from '@/lib/db/prisma';

/**
 * Event Access Policy Tests
 *
 * Tests cover:
 * - Owner vs non-owner access
 * - Block enforcement
 * - Friendship + canViewCalendar gating
 * - Event visibility (PRIVATE, FRIENDS, PUBLIC)
 * - Detail level resolution (owner, BUSY_ONLY cover, friendship-based)
 * - Event redaction for DETAILS vs BUSY_ONLY
 * - Attendee anonymity check
 */

// Mock Prisma
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    friendship: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock friendship policy
vi.mock('@/lib/policies/friendship', () => ({
  isBlocked: vi.fn(),
}));

import { isBlocked } from '@/lib/policies/friendship';

const mockIsBlocked = isBlocked as any;
const mockPrisma = prisma as any;

function makeEvent(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'event-1',
    ownerId: 'owner-1',
    title: 'Team Lunch',
    description: 'Lunch at the park',
    locationName: 'Central Park',
    startAt: new Date('2025-06-15T12:00:00Z'),
    endAt: new Date('2025-06-15T13:00:00Z'),
    timezone: 'UTC',
    visibility: 'FRIENDS',
    coverMode: 'NONE',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('canViewerSeeEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow owner to see their own event', async () => {
    const event = makeEvent();
    const result = await canViewerSeeEvent(event, 'owner-1');
    expect(result).toBe(true);
    // Should not call isBlocked or prisma for owner
    expect(mockIsBlocked).not.toHaveBeenCalled();
  });

  it('should deny access if viewer is blocked', async () => {
    const event = makeEvent();
    mockIsBlocked.mockResolvedValue(true);

    const result = await canViewerSeeEvent(event, 'viewer-1');
    expect(result).toBe(false);
    expect(mockIsBlocked).toHaveBeenCalledWith('viewer-1', 'owner-1');
  });

  it('should deny access if not friends', async () => {
    const event = makeEvent();
    mockIsBlocked.mockResolvedValue(false);
    mockPrisma.friendship.findFirst.mockResolvedValue(null);

    const result = await canViewerSeeEvent(event, 'viewer-1');
    expect(result).toBe(false);
  });

  it('should deny access if friend but canViewCalendar is false', async () => {
    const event = makeEvent();
    mockIsBlocked.mockResolvedValue(false);
    mockPrisma.friendship.findFirst.mockResolvedValue({
      canViewCalendar: false,
    });

    const result = await canViewerSeeEvent(event, 'viewer-1');
    expect(result).toBe(false);
  });

  it('should deny access to PRIVATE events for non-owner friends', async () => {
    const event = makeEvent({ visibility: 'PRIVATE' });
    mockIsBlocked.mockResolvedValue(false);
    mockPrisma.friendship.findFirst.mockResolvedValue({
      canViewCalendar: true,
    });

    const result = await canViewerSeeEvent(event, 'viewer-1');
    expect(result).toBe(false);
  });

  it('should allow access to FRIENDS events for friends with canViewCalendar', async () => {
    const event = makeEvent({ visibility: 'FRIENDS' });
    mockIsBlocked.mockResolvedValue(false);
    mockPrisma.friendship.findFirst.mockResolvedValue({
      canViewCalendar: true,
    });

    const result = await canViewerSeeEvent(event, 'viewer-1');
    expect(result).toBe(true);
  });

  it('should allow access to PUBLIC events for friends with canViewCalendar', async () => {
    const event = makeEvent({ visibility: 'PUBLIC' });
    mockIsBlocked.mockResolvedValue(false);
    mockPrisma.friendship.findFirst.mockResolvedValue({
      canViewCalendar: true,
    });

    const result = await canViewerSeeEvent(event, 'viewer-1');
    expect(result).toBe(true);
  });

  it('should return false for unknown visibility values', async () => {
    const event = makeEvent({ visibility: 'UNKNOWN' });
    mockIsBlocked.mockResolvedValue(false);
    mockPrisma.friendship.findFirst.mockResolvedValue({
      canViewCalendar: true,
    });

    const result = await canViewerSeeEvent(event, 'viewer-1');
    expect(result).toBe(false);
  });
});

describe('getViewerDetailLevel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return DETAILS for owner', async () => {
    const event = makeEvent();
    const result = await getViewerDetailLevel(event, 'owner-1');
    expect(result).toBe('DETAILS');
  });

  it('should return BUSY_ONLY when event coverMode is BUSY_ONLY', async () => {
    const event = makeEvent({ coverMode: 'BUSY_ONLY' });
    const result = await getViewerDetailLevel(event, 'viewer-1');
    expect(result).toBe('BUSY_ONLY');
    // Should not query friendship since coverMode overrides
    expect(mockPrisma.friendship.findFirst).not.toHaveBeenCalled();
  });

  it('should return friendship detailLevel when coverMode is NONE', async () => {
    const event = makeEvent({ coverMode: 'NONE' });
    mockPrisma.friendship.findFirst.mockResolvedValue({
      detailLevel: 'DETAILS',
    });

    const result = await getViewerDetailLevel(event, 'viewer-1');
    expect(result).toBe('DETAILS');
  });

  it('should default to BUSY_ONLY when no friendship exists', async () => {
    const event = makeEvent({ coverMode: 'NONE' });
    mockPrisma.friendship.findFirst.mockResolvedValue(null);

    const result = await getViewerDetailLevel(event, 'viewer-1');
    expect(result).toBe('BUSY_ONLY');
  });

  it('should return friendship BUSY_ONLY when friend has restricted detail level', async () => {
    const event = makeEvent({ coverMode: 'NONE' });
    mockPrisma.friendship.findFirst.mockResolvedValue({
      detailLevel: 'BUSY_ONLY',
    });

    const result = await getViewerDetailLevel(event, 'viewer-1');
    expect(result).toBe('BUSY_ONLY');
  });
});

describe('redactEventForViewer', () => {
  it('should return full event for DETAILS level', () => {
    const event = makeEvent();
    const result = redactEventForViewer(event, 'DETAILS');
    expect(result).toEqual(event);
    expect(result.title).toBe('Team Lunch');
    expect(result.description).toBe('Lunch at the park');
    expect(result.locationName).toBe('Central Park');
  });

  it('should redact title, description, and location for BUSY_ONLY level', () => {
    const event = makeEvent();
    const result = redactEventForViewer(event, 'BUSY_ONLY');
    expect(result.title).toBe('Busy');
    expect(result.description).toBeNull();
    expect(result.locationName).toBeNull();
    // Should preserve other fields
    expect(result.startAt).toEqual(event.startAt);
    expect(result.endAt).toEqual(event.endAt);
    expect(result.id).toBe(event.id);
  });
});

describe('isAttendeeAnonymous', () => {
  it('should return true for ANONYMOUS', () => {
    expect(isAttendeeAnonymous('ANONYMOUS')).toBe(true);
  });

  it('should return false for NAMED', () => {
    expect(isAttendeeAnonymous('NAMED')).toBe(false);
  });

  it('should return false for other values', () => {
    expect(isAttendeeAnonymous('')).toBe(false);
    expect(isAttendeeAnonymous('OTHER')).toBe(false);
  });
});
