/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getFriendCalendarPermission,
  filterEventsForViewer,
} from '@/lib/policies/calendarAccess';
import { prisma } from '@/lib/db/prisma';

/**
 * Calendar Access Policy Tests
 *
 * Tests cover:
 * - Per-friend sharing override behavior
 * - Block relationship enforcement
 * - Event redaction based on permissions
 * - PRIVATE event handling
 */

// Mock Prisma
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    friendship: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    settings: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock friendship policy
vi.mock('@/lib/policies/friendship', () => ({
  isBlocked: vi.fn(),
  areFriends: vi.fn(),
}));

import { isBlocked } from '@/lib/policies/friendship';

describe('Calendar Access Policy - Permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should deny access if blocked', async () => {
    const mockIsBlocked = isBlocked as any;
    mockIsBlocked.mockResolvedValue(true);

    const permission = await getFriendCalendarPermission('owner1', 'viewer1');

    expect(permission.allowed).toBe(false);
    expect(permission.detailLevel).toBeNull();
  });

  it('should deny access if not accepted friends', async () => {
    const mockIsBlocked = isBlocked as any;
    const mockPrisma = prisma as any;

    mockIsBlocked.mockResolvedValue(false);
    // First call: viewer→owner (returns null)
    mockPrisma.friendship.findUnique.mockResolvedValueOnce(null);
    // Second call: owner→viewer (returns null - no friendship either way)
    mockPrisma.friendship.findUnique.mockResolvedValueOnce(null);

    const permission = await getFriendCalendarPermission('owner1', 'viewer1');

    expect(permission.allowed).toBe(false);
    expect(permission.detailLevel).toBeNull();
  });

  it('should deny access if canViewCalendar is false', async () => {
    const mockIsBlocked = isBlocked as any;
    const mockPrisma = prisma as any;

    mockIsBlocked.mockResolvedValue(false);
    // First call: viewer→owner direction (preferred)
    mockPrisma.friendship.findUnique.mockResolvedValueOnce({
      canViewCalendar: false,
      detailLevel: 'BUSY_ONLY',
    });

    const permission = await getFriendCalendarPermission('owner1', 'viewer1');

    expect(permission.allowed).toBe(false);
    expect(permission.detailLevel).toBeNull();
  });

  it('should allow access and use per-friend override when set', async () => {
    const mockIsBlocked = isBlocked as any;
    const mockPrisma = prisma as any;

    mockIsBlocked.mockResolvedValue(false);
    // First call: viewer→owner direction (preferred)
    mockPrisma.friendship.findUnique.mockResolvedValueOnce({
      canViewCalendar: true,
      detailLevel: 'DETAILS', // Per-friend override
    });

    const permission = await getFriendCalendarPermission('owner1', 'viewer1');

    expect(permission.allowed).toBe(true);
    expect(permission.detailLevel).toBe('DETAILS');
  });

  it('should use owner default when per-friend override is null', async () => {
    const mockIsBlocked = isBlocked as any;
    const mockPrisma = prisma as any;

    mockIsBlocked.mockResolvedValue(false);
    // First call: viewer→owner direction (preferred)
    mockPrisma.friendship.findUnique.mockResolvedValueOnce({
      canViewCalendar: true,
      detailLevel: null, // No override, use default
    });
    mockPrisma.settings.findUnique.mockResolvedValue({
      defaultDetailLevel: 'BUSY_ONLY',
    });

    const permission = await getFriendCalendarPermission('owner1', 'viewer1');

    expect(permission.allowed).toBe(true);
    expect(permission.detailLevel).toBe('BUSY_ONLY');
  });

  it('should override defaults: owner DETAILS, friend BUSY_ONLY', async () => {
    const mockIsBlocked = isBlocked as any;
    const mockPrisma = prisma as any;

    mockIsBlocked.mockResolvedValue(false);
    // First call: viewer→owner direction (preferred)
    mockPrisma.friendship.findUnique.mockResolvedValueOnce({
      canViewCalendar: true,
      detailLevel: 'BUSY_ONLY', // Override: stricter than default
    });
    mockPrisma.settings.findUnique.mockResolvedValue({
      defaultDetailLevel: 'DETAILS',
    });

    const permission = await getFriendCalendarPermission('owner1', 'viewer1');

    // Verify override wins
    expect(permission.allowed).toBe(true);
    expect(permission.detailLevel).toBe('BUSY_ONLY');
  });
});

describe('Calendar Access Policy - Event Redaction', () => {
  const mockPermissionDenied = {
    allowed: false,
    detailLevel: null as any,
  };

  const mockPermissionBusyOnly = {
    allowed: true,
    detailLevel: 'BUSY_ONLY' as const,
  };

  const mockPermissionDetails = {
    allowed: true,
    detailLevel: 'DETAILS' as const,
  };

  const mockEvents = [
    {
      id: 'event1',
      title: 'Team Meeting',
      startAt: new Date('2026-02-05T10:00:00Z'),
      endAt: new Date('2026-02-05T11:00:00Z'),
      locationName: 'Conference Room A',
      visibility: 'FRIENDS' as const,
    },
    {
      id: 'event2',
      title: 'Personal Appointment',
      startAt: new Date('2026-02-05T14:00:00Z'),
      endAt: new Date('2026-02-05T15:00:00Z'),
      locationName: 'Downtown Clinic',
      visibility: 'PRIVATE' as const,
    },
  ];

  it('should return empty array if not allowed', () => {
    const redacted = filterEventsForViewer(mockEvents, mockPermissionDenied);
    expect(redacted).toHaveLength(0);
  });

  it('should redact events to "Busy" if BUSY_ONLY permission', () => {
    const redacted = filterEventsForViewer(mockEvents, mockPermissionBusyOnly);

    expect(redacted).toHaveLength(2);
    expect(redacted[0].title).toBe('Busy');
    expect(redacted[0].redacted).toBe(true);
    expect(redacted[0].locationName).toBeUndefined();
  });

  it('should show details if DETAILS permission and event is not PRIVATE', () => {
    const redacted = filterEventsForViewer(mockEvents, mockPermissionDetails);

    // Public/Friends event should show details
    expect(redacted[0].title).toBe('Team Meeting');
    expect(redacted[0].locationName).toBe('Conference Room A');
    expect(redacted[0].redacted).toBe(false);
  });

  it('should redact PRIVATE events even with DETAILS permission', () => {
    const redacted = filterEventsForViewer(mockEvents, mockPermissionDetails);

    // PRIVATE event should always be redacted
    expect(redacted[1].title).toBe('Busy');
    expect(redacted[1].redacted).toBe(true);
    expect(redacted[1].locationName).toBeUndefined();
  });

  it('should preserve event id, startAt, endAt always', () => {
    const redacted = filterEventsForViewer(mockEvents, mockPermissionBusyOnly);

    expect(redacted[0].id).toBe('event1');
    expect(redacted[0].startAt).toEqual(mockEvents[0].startAt);
    expect(redacted[0].endAt).toEqual(mockEvents[0].endAt);
  });
});
