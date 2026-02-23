/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Google Calendar Sync Tests
 *
 * Tests cover:
 * 1. Loop prevention — syncPull no-ops when Google etag is unchanged
 * 2. Mapping correctness — push creates mapping with googleEventId
 * 3. Idempotency — repeated sync produces same state
 * 4. Source filtering — imported (GOOGLE) events never pushed back
 */

// Mock the Google API client
vi.mock('@/lib/google/client', () => ({
  listAllEvents: vi.fn(),
  insertEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

// Mock Prisma
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    googleCalendarConnection: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    googleEventMapping: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    event: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    account: {
      findFirst: vi.fn(),
    },
  },
}));

import { syncPull, syncPush, syncAll } from '@/lib/google/sync';
import * as googleClient from '@/lib/google/client';
import { prisma } from '@/lib/db/prisma';

const mockPrisma = prisma as any;
const mockGoogleClient = googleClient as any;

describe('syncPull — Google → Koda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.googleCalendarConnection.findUnique.mockResolvedValue({
      syncWindowPastDays: 30,
      syncWindowFutureDays: 90,
    });
  });

  it('should import new Google events as source=GOOGLE with mapping', async () => {
    mockGoogleClient.listAllEvents.mockResolvedValue([
      {
        id: 'g-event-1',
        summary: 'Team Standup',
        description: 'Daily standup',
        location: 'Zoom',
        start: { dateTime: '2026-02-10T09:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2026-02-10T09:30:00Z', timeZone: 'UTC' },
        etag: '"etag-abc"',
        updated: '2026-02-10T08:00:00Z',
        status: 'confirmed',
      },
    ]);

    // No existing mapping
    mockPrisma.googleEventMapping.findUnique.mockResolvedValue(null);

    // Mock event creation
    mockPrisma.event.create.mockResolvedValue({ id: 'koda-event-1' });
    mockPrisma.googleEventMapping.create.mockResolvedValue({});

    const result = await syncPull('user-1');

    expect(result.pulled).toBe(1);
    expect(result.updated).toBe(0);

    // Verify event was created with source GOOGLE
    expect(mockPrisma.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: 'user-1',
        title: 'Team Standup',
        source: 'GOOGLE',
        externalId: 'g-event-1',
      }),
    });

    // Verify mapping was created
    expect(mockPrisma.googleEventMapping.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        kodaEventId: 'koda-event-1',
        googleEventId: 'g-event-1',
        googleEtag: '"etag-abc"',
      }),
    });
  });

  it('LOOP PREVENTION: should skip update when Google etag is unchanged', async () => {
    mockGoogleClient.listAllEvents.mockResolvedValue([
      {
        id: 'g-event-1',
        summary: 'Team Standup',
        start: { dateTime: '2026-02-10T09:00:00Z' },
        end: { dateTime: '2026-02-10T09:30:00Z' },
        etag: '"etag-same"',
        status: 'confirmed',
      },
    ]);

    // Existing mapping with SAME etag → should be a no-op
    mockPrisma.googleEventMapping.findUnique.mockResolvedValue({
      id: 'mapping-1',
      kodaEventId: 'koda-event-1',
      googleEtag: '"etag-same"',
    });

    const result = await syncPull('user-1');

    // No updates should happen — etag unchanged
    expect(result.pulled).toBe(0);
    expect(result.updated).toBe(0);
    expect(mockPrisma.event.update).not.toHaveBeenCalled();
    expect(mockPrisma.event.create).not.toHaveBeenCalled();
  });

  it('should update Koda event when Google etag changes', async () => {
    mockGoogleClient.listAllEvents.mockResolvedValue([
      {
        id: 'g-event-1',
        summary: 'Updated Meeting Title',
        start: {
          dateTime: '2026-02-10T10:00:00Z',
          timeZone: 'America/New_York',
        },
        end: { dateTime: '2026-02-10T11:00:00Z', timeZone: 'America/New_York' },
        etag: '"etag-new"',
        updated: '2026-02-10T09:00:00Z',
        status: 'confirmed',
      },
    ]);

    // Existing mapping with different etag → should update
    mockPrisma.googleEventMapping.findUnique.mockResolvedValue({
      id: 'mapping-1',
      kodaEventId: 'koda-event-1',
      googleEtag: '"etag-old"',
    });

    mockPrisma.event.update.mockResolvedValue({});
    mockPrisma.googleEventMapping.update.mockResolvedValue({});

    const result = await syncPull('user-1');

    expect(result.updated).toBe(1);
    expect(mockPrisma.event.update).toHaveBeenCalledWith({
      where: { id: 'koda-event-1' },
      data: expect.objectContaining({
        title: 'Updated Meeting Title',
      }),
    });

    // Mapping etag should be updated
    expect(mockPrisma.googleEventMapping.update).toHaveBeenCalledWith({
      where: { id: 'mapping-1' },
      data: expect.objectContaining({
        googleEtag: '"etag-new"',
      }),
    });
  });

  it('should handle cancelled Google events by deleting Koda event', async () => {
    mockGoogleClient.listAllEvents.mockResolvedValue([
      {
        id: 'g-event-cancelled',
        status: 'cancelled',
        start: { dateTime: '2026-02-10T09:00:00Z' },
        end: { dateTime: '2026-02-10T10:00:00Z' },
      },
    ]);

    mockPrisma.googleEventMapping.findUnique.mockResolvedValue({
      id: 'mapping-cancel',
      kodaEventId: 'koda-event-cancel',
    });

    mockPrisma.event.delete.mockResolvedValue({});
    mockPrisma.googleEventMapping.delete.mockResolvedValue({});

    const result = await syncPull('user-1');

    expect(result.deleted).toBe(1);
  });

  it('should import all-day events using date as fallback when dateTime is absent', async () => {
    mockGoogleClient.listAllEvents.mockResolvedValue([
      {
        id: 'g-all-day',
        summary: 'All Day Event',
        start: { date: '2026-02-10' },
        end: { date: '2026-02-11' },
        etag: '"etag-allday"',
        status: 'confirmed',
      },
    ]);

    mockPrisma.googleEventMapping.findUnique.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: 'koda-allday' });
    mockPrisma.googleEventMapping.create.mockResolvedValue({});

    const result = await syncPull('user-1');

    // All-day events are imported (date field is accepted as fallback)
    expect(result.pulled).toBe(1);
  });

  it('should return error summary when Google API call fails', async () => {
    mockGoogleClient.listAllEvents.mockRejectedValue(
      new Error('Google API quota exceeded')
    );

    const result = await syncPull('user-1');

    expect(result.pulled).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Google API quota exceeded');
  });

  it('should use default sync window when connection is null', async () => {
    mockPrisma.googleCalendarConnection.findUnique.mockResolvedValue(null);
    mockGoogleClient.listAllEvents.mockResolvedValue([]);

    const result = await syncPull('user-1');

    expect(result.pulled).toBe(0);
    // Verify listAllEvents was still called (using defaults 30/90)
    expect(mockGoogleClient.listAllEvents).toHaveBeenCalled();
  });

  it('should record error and continue when a single event fails during pull', async () => {
    mockGoogleClient.listAllEvents.mockResolvedValue([
      {
        id: 'g-good',
        summary: 'Good Event',
        start: { dateTime: '2026-02-10T09:00:00Z' },
        end: { dateTime: '2026-02-10T10:00:00Z' },
        etag: '"etag-good"',
        status: 'confirmed',
      },
      {
        id: 'g-bad',
        summary: 'Bad Event',
        start: { dateTime: '2026-02-10T11:00:00Z' },
        end: { dateTime: '2026-02-10T12:00:00Z' },
        etag: '"etag-bad"',
        status: 'confirmed',
      },
    ]);

    // First event: no mapping, create succeeds
    mockPrisma.googleEventMapping.findUnique
      .mockResolvedValueOnce(null) // g-good lookup
      .mockResolvedValueOnce(null); // g-bad lookup

    mockPrisma.event.create
      .mockResolvedValueOnce({ id: 'koda-good' }) // g-good create
      .mockRejectedValueOnce(new Error('DB constraint error')); // g-bad fails

    mockPrisma.googleEventMapping.create.mockResolvedValue({});

    const result = await syncPull('user-1');

    expect(result.pulled).toBe(1); // Only the good one
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('g-bad');
  });

  it('should skip events with missing id', async () => {
    mockGoogleClient.listAllEvents.mockResolvedValue([
      {
        id: null,
        summary: 'No ID Event',
        start: { dateTime: '2026-02-10T09:00:00Z' },
        end: { dateTime: '2026-02-10T10:00:00Z' },
        status: 'confirmed',
      },
    ]);

    const result = await syncPull('user-1');

    expect(result.pulled).toBe(0);
    expect(mockPrisma.event.create).not.toHaveBeenCalled();
  });

  it('should skip events with missing start dateTime and date', async () => {
    mockGoogleClient.listAllEvents.mockResolvedValue([
      {
        id: 'g-no-start',
        summary: 'Missing Start',
        start: {},
        end: { dateTime: '2026-02-10T10:00:00Z' },
        status: 'confirmed',
      },
    ]);

    const result = await syncPull('user-1');

    expect(result.pulled).toBe(0);
    expect(mockPrisma.event.create).not.toHaveBeenCalled();
  });

  it('should no-op when cancelled event has no existing mapping', async () => {
    mockGoogleClient.listAllEvents.mockResolvedValue([
      {
        id: 'g-cancelled-no-map',
        status: 'cancelled',
        start: { dateTime: '2026-02-10T09:00:00Z' },
        end: { dateTime: '2026-02-10T10:00:00Z' },
      },
    ]);

    // No mapping exists for this cancelled event
    mockPrisma.googleEventMapping.findUnique.mockResolvedValue(null);

    const result = await syncPull('user-1');

    expect(result.deleted).toBe(0);
    expect(mockPrisma.event.delete).not.toHaveBeenCalled();
  });

  it('should use Untitled when Google event has no summary', async () => {
    mockGoogleClient.listAllEvents.mockResolvedValue([
      {
        id: 'g-no-title',
        start: { dateTime: '2026-02-10T09:00:00Z' },
        end: { dateTime: '2026-02-10T10:00:00Z' },
        etag: '"etag-notitle"',
        status: 'confirmed',
      },
    ]);

    mockPrisma.googleEventMapping.findUnique.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: 'koda-notitle' });
    mockPrisma.googleEventMapping.create.mockResolvedValue({});

    await syncPull('user-1');

    expect(mockPrisma.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Untitled',
      }),
    });
  });

  it('should handle null etag on mapping during loop prevention check', async () => {
    mockGoogleClient.listAllEvents.mockResolvedValue([
      {
        id: 'g-event-null-etag',
        summary: 'Event',
        start: { dateTime: '2026-02-10T09:00:00Z' },
        end: { dateTime: '2026-02-10T10:00:00Z' },
        etag: '"new-etag"',
        status: 'confirmed',
      },
    ]);

    // Existing mapping with null etag should always update
    mockPrisma.googleEventMapping.findUnique.mockResolvedValue({
      id: 'mapping-null',
      kodaEventId: 'koda-null-etag',
      googleEtag: null,
    });

    mockPrisma.event.update.mockResolvedValue({});
    mockPrisma.googleEventMapping.update.mockResolvedValue({});

    const result = await syncPull('user-1');

    expect(result.updated).toBe(1);
    expect(mockPrisma.event.update).toHaveBeenCalled();
  });
});

describe('syncPush — Koda → Google', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should push new Koda event to Google and create mapping', async () => {
    mockPrisma.googleCalendarConnection.findUnique.mockResolvedValue({
      pushEnabled: true,
    });

    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: 'koda-new-1',
        title: 'Koda Meeting',
        description: 'A meeting from Koda',
        locationName: 'Office',
        startAt: new Date('2026-02-12T14:00:00Z'),
        endAt: new Date('2026-02-12T15:00:00Z'),
        timezone: 'UTC',
        source: 'KODA',
        syncToGoogle: true,
        updatedAt: new Date('2026-02-12T13:00:00Z'),
        googleEventMapping: null,
      },
    ]);

    mockPrisma.googleEventMapping.findMany.mockResolvedValue([]);

    mockGoogleClient.insertEvent.mockResolvedValue({
      id: 'g-created-1',
      etag: '"etag-created"',
      updated: '2026-02-12T14:00:00Z',
    });

    mockPrisma.googleEventMapping.create.mockResolvedValue({});

    const result = await syncPush('user-1');

    expect(result.pushed).toBe(1);
    expect(mockGoogleClient.insertEvent).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        summary: 'Koda Meeting',
      })
    );

    // Mapping should be created with googleEventId
    expect(mockPrisma.googleEventMapping.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        kodaEventId: 'koda-new-1',
        googleEventId: 'g-created-1',
        googleEtag: '"etag-created"',
      }),
    });
  });

  it('LOOP PREVENTION: should skip push when Koda event not changed since last push', async () => {
    const pushTime = new Date('2026-02-12T15:00:00Z');
    const eventUpdateTime = new Date('2026-02-12T14:00:00Z'); // BEFORE push

    mockPrisma.googleCalendarConnection.findUnique.mockResolvedValue({
      pushEnabled: true,
    });

    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: 'koda-1',
        title: 'Unchanged Event',
        startAt: new Date('2026-02-12T14:00:00Z'),
        endAt: new Date('2026-02-12T15:00:00Z'),
        timezone: 'UTC',
        source: 'KODA',
        syncToGoogle: true,
        updatedAt: eventUpdateTime,
        googleEventMapping: {
          id: 'mapping-1',
          googleEventId: 'g-1',
          lastPushedAt: pushTime, // AFTER event update → no-op
        },
      },
    ]);

    mockPrisma.googleEventMapping.findMany.mockResolvedValue([]);

    const result = await syncPush('user-1');

    expect(result.pushed).toBe(0);
    expect(result.updated).toBe(0);
    expect(mockGoogleClient.updateEvent).not.toHaveBeenCalled();
    expect(mockGoogleClient.insertEvent).not.toHaveBeenCalled();
  });

  it('should never push source=GOOGLE events back to Google', async () => {
    mockPrisma.googleCalendarConnection.findUnique.mockResolvedValue({
      pushEnabled: true,
    });

    // findMany should filter source=KODA, so imported events are excluded
    mockPrisma.event.findMany.mockResolvedValue([]);
    mockPrisma.googleEventMapping.findMany.mockResolvedValue([]);

    const result = await syncPush('user-1');

    // Verify findMany was called with source KODA filter
    expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          source: 'KODA',
        }),
      })
    );

    expect(result.pushed).toBe(0);
  });

  it('should record error and continue when a single push fails', async () => {
    mockPrisma.googleCalendarConnection.findUnique.mockResolvedValue({
      pushEnabled: true,
    });

    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: 'koda-fail',
        title: 'Failing Event',
        description: null,
        locationName: null,
        startAt: new Date('2026-02-12T14:00:00Z'),
        endAt: new Date('2026-02-12T15:00:00Z'),
        timezone: 'UTC',
        source: 'KODA',
        syncToGoogle: true,
        updatedAt: new Date('2026-02-12T13:00:00Z'),
        googleEventMapping: null,
      },
    ]);

    mockPrisma.googleEventMapping.findMany.mockResolvedValue([]);
    mockGoogleClient.insertEvent.mockRejectedValue(
      new Error('Google API insert failed')
    );

    const result = await syncPush('user-1');

    expect(result.pushed).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('koda-fail');
  });

  it('should default to pushEnabled=false when connection is null', async () => {
    mockPrisma.googleCalendarConnection.findUnique.mockResolvedValue(null);

    // With globalPush=false, only syncToGoogle=true events are fetched
    mockPrisma.event.findMany.mockResolvedValue([]);
    mockPrisma.googleEventMapping.findMany.mockResolvedValue([]);

    const result = await syncPush('user-1');

    expect(result.pushed).toBe(0);
    // Verify the query filters for syncToGoogle when pushEnabled is false
    expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          syncToGoogle: true,
        }),
      })
    );
  });

  it('should push all KODA events when globalPush is enabled', async () => {
    mockPrisma.googleCalendarConnection.findUnique.mockResolvedValue({
      pushEnabled: true,
    });

    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: 'koda-global',
        title: 'Global Push Event',
        description: 'desc',
        locationName: 'loc',
        startAt: new Date('2026-02-12T14:00:00Z'),
        endAt: new Date('2026-02-12T15:00:00Z'),
        timezone: 'UTC',
        source: 'KODA',
        syncToGoogle: false, // not per-event, but globalPush is on
        updatedAt: new Date('2026-02-12T13:00:00Z'),
        googleEventMapping: null,
      },
    ]);

    mockPrisma.googleEventMapping.findMany.mockResolvedValue([]);

    mockGoogleClient.insertEvent.mockResolvedValue({
      id: 'g-global-1',
      etag: '"etag-global"',
      updated: '2026-02-12T14:00:00Z',
    });

    mockPrisma.googleEventMapping.create.mockResolvedValue({});

    const result = await syncPush('user-1');

    expect(result.pushed).toBe(1);
    // Verify query did NOT include syncToGoogle filter (globalPush overrides)
    expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({
          syncToGoogle: true,
        }),
      })
    );
  });

  it('should skip event when globalPush is false and syncToGoogle is false', async () => {
    mockPrisma.googleCalendarConnection.findUnique.mockResolvedValue({
      pushEnabled: false,
    });

    // Even if findMany returns an event with syncToGoogle=false, the guard skips it
    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: 'koda-skip',
        title: 'Should Skip',
        startAt: new Date('2026-02-12T14:00:00Z'),
        endAt: new Date('2026-02-12T15:00:00Z'),
        timezone: 'UTC',
        source: 'KODA',
        syncToGoogle: false,
        updatedAt: new Date('2026-02-12T13:00:00Z'),
        googleEventMapping: null,
      },
    ]);

    mockPrisma.googleEventMapping.findMany.mockResolvedValue([]);

    const result = await syncPush('user-1');

    expect(result.pushed).toBe(0);
    expect(mockGoogleClient.insertEvent).not.toHaveBeenCalled();
  });

  it('should handle Google API returning null etag and updated on insert', async () => {
    mockPrisma.googleCalendarConnection.findUnique.mockResolvedValue({
      pushEnabled: true,
    });

    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: 'koda-null-resp',
        title: 'Null Response Fields',
        description: null,
        locationName: null,
        startAt: new Date('2026-02-12T14:00:00Z'),
        endAt: new Date('2026-02-12T15:00:00Z'),
        timezone: 'UTC',
        source: 'KODA',
        syncToGoogle: true,
        updatedAt: new Date('2026-02-12T13:00:00Z'),
        googleEventMapping: null,
      },
    ]);

    mockPrisma.googleEventMapping.findMany.mockResolvedValue([]);

    // Google returns without etag or updated
    mockGoogleClient.insertEvent.mockResolvedValue({
      id: 'g-null-resp',
    });

    mockPrisma.googleEventMapping.create.mockResolvedValue({});

    const result = await syncPush('user-1');

    expect(result.pushed).toBe(1);
    expect(mockPrisma.googleEventMapping.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        googleEtag: null,
        googleUpdatedAt: null,
      }),
    });
  });

  it('should handle Google API returning null etag and updated on update', async () => {
    const lastPush = new Date('2026-02-12T10:00:00Z');
    const eventUpdate = new Date('2026-02-12T12:00:00Z');

    mockPrisma.googleCalendarConnection.findUnique.mockResolvedValue({
      pushEnabled: true,
    });

    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: 'koda-upd-null',
        title: 'Update Null Response',
        description: null,
        locationName: null,
        startAt: new Date('2026-02-13T09:00:00Z'),
        endAt: new Date('2026-02-13T10:00:00Z'),
        timezone: 'UTC',
        source: 'KODA',
        syncToGoogle: true,
        updatedAt: eventUpdate,
        googleEventMapping: {
          id: 'mapping-upd-null',
          googleEventId: 'g-upd-null',
          lastPushedAt: lastPush,
        },
      },
    ]);

    mockPrisma.googleEventMapping.findMany.mockResolvedValue([]);

    // Google returns without etag or updated
    mockGoogleClient.updateEvent.mockResolvedValue({
      id: 'g-upd-null',
    });

    mockPrisma.googleEventMapping.update.mockResolvedValue({});

    const result = await syncPush('user-1');

    expect(result.updated).toBe(1);
    expect(mockPrisma.googleEventMapping.update).toHaveBeenCalledWith({
      where: { id: 'mapping-upd-null' },
      data: expect.objectContaining({
        googleEtag: null,
        googleUpdatedAt: null,
      }),
    });
  });

  it('should push when mapping exists but lastPushedAt is null', async () => {
    mockPrisma.googleCalendarConnection.findUnique.mockResolvedValue({
      pushEnabled: true,
    });

    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: 'koda-no-push-ts',
        title: 'Never Pushed Before',
        description: null,
        locationName: null,
        startAt: new Date('2026-02-13T09:00:00Z'),
        endAt: new Date('2026-02-13T10:00:00Z'),
        timezone: 'UTC',
        source: 'KODA',
        syncToGoogle: true,
        updatedAt: new Date('2026-02-13T08:00:00Z'),
        googleEventMapping: {
          id: 'mapping-no-push',
          googleEventId: 'g-no-push',
          lastPushedAt: null, // Never pushed before
        },
      },
    ]);

    mockPrisma.googleEventMapping.findMany.mockResolvedValue([]);

    mockGoogleClient.updateEvent.mockResolvedValue({
      id: 'g-no-push',
      etag: '"etag-first-push"',
      updated: '2026-02-13T09:01:00Z',
    });

    mockPrisma.googleEventMapping.update.mockResolvedValue({});

    const result = await syncPush('user-1');

    // Should update (not skip) because lastPushedAt is null
    expect(result.updated).toBe(1);
    expect(mockGoogleClient.updateEvent).toHaveBeenCalled();
  });

  it('should update existing Google event when Koda event changed', async () => {
    const lastPush = new Date('2026-02-12T10:00:00Z');
    const eventUpdate = new Date('2026-02-12T12:00:00Z'); // AFTER last push

    mockPrisma.googleCalendarConnection.findUnique.mockResolvedValue({
      pushEnabled: true,
    });

    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: 'koda-updated',
        title: 'Updated Koda Event',
        description: null,
        locationName: null,
        startAt: new Date('2026-02-13T09:00:00Z'),
        endAt: new Date('2026-02-13T10:00:00Z'),
        timezone: 'UTC',
        source: 'KODA',
        syncToGoogle: true,
        updatedAt: eventUpdate,
        googleEventMapping: {
          id: 'mapping-upd',
          googleEventId: 'g-upd-1',
          lastPushedAt: lastPush,
        },
      },
    ]);

    mockPrisma.googleEventMapping.findMany.mockResolvedValue([]);

    mockGoogleClient.updateEvent.mockResolvedValue({
      id: 'g-upd-1',
      etag: '"etag-updated"',
      updated: '2026-02-12T12:01:00Z',
    });

    mockPrisma.googleEventMapping.update.mockResolvedValue({});

    const result = await syncPush('user-1');

    expect(result.updated).toBe(1);
    expect(mockGoogleClient.updateEvent).toHaveBeenCalledWith(
      'user-1',
      'g-upd-1',
      expect.objectContaining({ summary: 'Updated Koda Event' })
    );
  });
});

describe('syncAll — full bidirectional sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should run pull then push and update lastSyncedAt', async () => {
    // Setup pull mocks
    mockPrisma.googleCalendarConnection.findUnique.mockResolvedValue({
      syncWindowPastDays: 30,
      syncWindowFutureDays: 90,
      pushEnabled: false,
    });
    mockGoogleClient.listAllEvents.mockResolvedValue([]);
    mockPrisma.event.findMany.mockResolvedValue([]);
    mockPrisma.googleEventMapping.findMany.mockResolvedValue([]);
    mockPrisma.googleCalendarConnection.upsert.mockResolvedValue({});

    const result = await syncAll('user-1');

    expect(result.pulled).toBe(0);
    expect(result.pushed).toBe(0);

    // Verify lastSyncedAt was updated
    expect(mockPrisma.googleCalendarConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        update: expect.objectContaining({
          lastSyncedAt: expect.any(Date),
        }),
      })
    );
  });

  it('should be idempotent: repeated sync with no changes produces same result', async () => {
    mockPrisma.googleCalendarConnection.findUnique.mockResolvedValue({
      syncWindowPastDays: 30,
      syncWindowFutureDays: 90,
      pushEnabled: false,
    });
    mockGoogleClient.listAllEvents.mockResolvedValue([]);
    mockPrisma.event.findMany.mockResolvedValue([]);
    mockPrisma.googleEventMapping.findMany.mockResolvedValue([]);
    mockPrisma.googleCalendarConnection.upsert.mockResolvedValue({});

    const result1 = await syncAll('user-1');
    const result2 = await syncAll('user-1');

    expect(result1).toEqual(result2);
  });
});
