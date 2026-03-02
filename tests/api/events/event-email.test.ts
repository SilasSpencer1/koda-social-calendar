import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  getSession: () => mockGetSession(),
}));

const mockEventFindUnique = vi.fn();
const mockEventUpdate = vi.fn();
const mockEventDelete = vi.fn();
const mockAttendeeFindMany = vi.fn();
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    event: {
      findUnique: (...args: unknown[]) => mockEventFindUnique(...args),
      update: (...args: unknown[]) => mockEventUpdate(...args),
      delete: (...args: unknown[]) => mockEventDelete(...args),
    },
    attendee: {
      findMany: (...args: unknown[]) => mockAttendeeFindMany(...args),
    },
  },
}));

vi.mock('@/lib/policies/eventAccess', () => ({
  isAttendeeAnonymous: (v: string) => v === 'ANONYMOUS',
}));

const mockSendEventUpdatedEmail = vi.fn();
const mockSendEventCancelledEmail = vi.fn();
const mockIsEmailEnabledForUser = vi.fn();
vi.mock('@/lib/email', () => ({
  sendEventUpdatedEmail: (...args: unknown[]) =>
    mockSendEventUpdatedEmail(...args),
  sendEventCancelledEmail: (...args: unknown[]) =>
    mockSendEventCancelledEmail(...args),
  isEmailEnabledForUser: (...args: unknown[]) =>
    mockIsEmailEnabledForUser(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const futureEnd = new Date(futureDate.getTime() + 2 * 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// PATCH /api/events/:id — email on material changes
// ---------------------------------------------------------------------------

describe('PATCH /api/events/:id — update notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsEmailEnabledForUser.mockResolvedValue(false);
    mockSendEventUpdatedEmail.mockResolvedValue(undefined);
  });

  it('sends update email to GOING attendees when time changes', async () => {
    const { PATCH } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue({ user: { id: 'host-1' } });
    mockEventFindUnique.mockResolvedValue({
      ownerId: 'host-1',
      startAt: futureDate,
      endAt: futureEnd,
    });
    mockEventUpdate.mockResolvedValue({
      id: 'evt-1',
      title: 'Game Night',
      startAt: new Date(futureDate.getTime() + 3600000),
      endAt: futureEnd,
      timezone: 'America/New_York',
      locationName: 'Central Park',
      attendees: [
        {
          id: 'att-1',
          userId: 'user-2',
          status: 'GOING',
          anonymity: 'NAMED',
          role: 'ATTENDEE',
        },
      ],
    });
    mockAttendeeFindMany.mockResolvedValue([
      {
        userId: 'user-2',
        user: { id: 'user-2', name: 'Alice', email: 'alice@example.com' },
      },
    ]);
    mockIsEmailEnabledForUser.mockResolvedValue(true);

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'PATCH',
      body: JSON.stringify({
        startAt: new Date(futureDate.getTime() + 3600000).toISOString(),
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await PATCH(req, {
      params: Promise.resolve({ id: 'evt-1' }),
    });
    expect(res.status).toBe(200);

    // Wait for fire-and-forget
    await new Promise((r) => setTimeout(r, 50));

    expect(mockAttendeeFindMany).toHaveBeenCalledTimes(1);
    expect(mockIsEmailEnabledForUser).toHaveBeenCalledWith('user-2');
    expect(mockSendEventUpdatedEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEventUpdatedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alice@example.com',
        attendeeName: 'Alice',
        eventTitle: 'Game Night',
        eventId: 'evt-1',
      })
    );
  });

  it('does not send email when only description changes', async () => {
    const { PATCH } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue({ user: { id: 'host-1' } });
    mockEventFindUnique.mockResolvedValue({
      ownerId: 'host-1',
      startAt: futureDate,
      endAt: futureEnd,
    });
    mockEventUpdate.mockResolvedValue({
      id: 'evt-1',
      title: 'Game Night',
      startAt: futureDate,
      endAt: futureEnd,
      timezone: 'UTC',
      locationName: null,
      attendees: [],
    });

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'PATCH',
      body: JSON.stringify({ description: 'Updated description' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await PATCH(req, {
      params: Promise.resolve({ id: 'evt-1' }),
    });
    expect(res.status).toBe(200);

    // Should not fetch attendees for email at all
    expect(mockAttendeeFindMany).not.toHaveBeenCalled();
    expect(mockSendEventUpdatedEmail).not.toHaveBeenCalled();
  });

  it('sends email when location changes', async () => {
    const { PATCH } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue({ user: { id: 'host-1' } });
    mockEventFindUnique.mockResolvedValue({
      ownerId: 'host-1',
      startAt: futureDate,
      endAt: futureEnd,
    });
    mockEventUpdate.mockResolvedValue({
      id: 'evt-1',
      title: 'Game Night',
      startAt: futureDate,
      endAt: futureEnd,
      timezone: 'UTC',
      locationName: 'New Location',
      attendees: [],
    });
    mockAttendeeFindMany.mockResolvedValue([
      {
        userId: 'user-2',
        user: { id: 'user-2', name: 'Alice', email: 'alice@example.com' },
      },
    ]);
    mockIsEmailEnabledForUser.mockResolvedValue(true);

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'PATCH',
      body: JSON.stringify({ locationName: 'New Location' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await PATCH(req, {
      params: Promise.resolve({ id: 'evt-1' }),
    });
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));
    expect(mockSendEventUpdatedEmail).toHaveBeenCalledTimes(1);
  });

  it('excludes the owner from update emails', async () => {
    const { PATCH } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue({ user: { id: 'host-1' } });
    mockEventFindUnique.mockResolvedValue({
      ownerId: 'host-1',
      startAt: futureDate,
      endAt: futureEnd,
    });
    mockEventUpdate.mockResolvedValue({
      id: 'evt-1',
      title: 'Game Night',
      startAt: new Date(futureDate.getTime() + 3600000),
      endAt: futureEnd,
      timezone: 'UTC',
      locationName: null,
      attendees: [],
    });
    mockAttendeeFindMany.mockResolvedValue([]);

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'PATCH',
      body: JSON.stringify({
        startAt: new Date(futureDate.getTime() + 3600000).toISOString(),
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    await PATCH(req, { params: Promise.resolve({ id: 'evt-1' }) });

    // The attendee query should exclude the owner
    const findManyCall = mockAttendeeFindMany.mock.calls[0][0];
    expect(findManyCall.where.userId).toEqual({ not: 'host-1' });
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:id — cancellation notifications
// ---------------------------------------------------------------------------

describe('DELETE /api/events/:id — cancellation notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsEmailEnabledForUser.mockResolvedValue(false);
    mockSendEventCancelledEmail.mockResolvedValue(undefined);
    mockEventDelete.mockResolvedValue({ id: 'evt-1' });
  });

  it('sends cancellation emails to all attendees (excluding host)', async () => {
    const { DELETE } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue({ user: { id: 'host-1' } });
    mockEventFindUnique.mockResolvedValue({
      ownerId: 'host-1',
      title: 'Game Night',
      startAt: futureDate,
      timezone: 'America/New_York',
      owner: { name: 'Bob' },
      attendees: [
        {
          userId: 'host-1',
          user: { id: 'host-1', name: 'Bob', email: 'bob@example.com' },
        },
        {
          userId: 'user-2',
          user: { id: 'user-2', name: 'Alice', email: 'alice@example.com' },
        },
        {
          userId: 'user-3',
          user: { id: 'user-3', name: 'Charlie', email: 'charlie@example.com' },
        },
      ],
    });
    mockIsEmailEnabledForUser.mockResolvedValue(true);

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'DELETE',
    });

    const res = await DELETE(req, {
      params: Promise.resolve({ id: 'evt-1' }),
    });
    expect(res.status).toBe(200);

    // Wait for fire-and-forget
    await new Promise((r) => setTimeout(r, 50));

    // Should email Alice and Charlie but NOT Bob (host)
    expect(mockIsEmailEnabledForUser).toHaveBeenCalledTimes(2);
    expect(mockIsEmailEnabledForUser).toHaveBeenCalledWith('user-2');
    expect(mockIsEmailEnabledForUser).toHaveBeenCalledWith('user-3');
    expect(mockSendEventCancelledEmail).toHaveBeenCalledTimes(2);
  });

  it('does not send emails when attendees have email disabled', async () => {
    const { DELETE } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue({ user: { id: 'host-1' } });
    mockEventFindUnique.mockResolvedValue({
      ownerId: 'host-1',
      title: 'Game Night',
      startAt: futureDate,
      timezone: 'UTC',
      owner: { name: 'Bob' },
      attendees: [
        {
          userId: 'user-2',
          user: { id: 'user-2', name: 'Alice', email: 'alice@example.com' },
        },
      ],
    });
    mockIsEmailEnabledForUser.mockResolvedValue(false);

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'DELETE',
    });

    const res = await DELETE(req, {
      params: Promise.resolve({ id: 'evt-1' }),
    });
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));
    expect(mockSendEventCancelledEmail).not.toHaveBeenCalled();
  });

  it('includes host name and event details in cancellation email', async () => {
    const { DELETE } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue({ user: { id: 'host-1' } });
    mockEventFindUnique.mockResolvedValue({
      ownerId: 'host-1',
      title: 'Game Night',
      startAt: futureDate,
      timezone: 'America/New_York',
      owner: { name: 'Bob' },
      attendees: [
        {
          userId: 'user-2',
          user: { id: 'user-2', name: 'Alice', email: 'alice@example.com' },
        },
      ],
    });
    mockIsEmailEnabledForUser.mockResolvedValue(true);

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'DELETE',
    });

    await DELETE(req, { params: Promise.resolve({ id: 'evt-1' }) });

    await new Promise((r) => setTimeout(r, 50));

    expect(mockSendEventCancelledEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alice@example.com',
        attendeeName: 'Alice',
        hostName: 'Bob',
        eventTitle: 'Game Night',
        eventTimezone: 'America/New_York',
      })
    );
  });

  it('deletes the event even if email sending fails', async () => {
    const { DELETE } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue({ user: { id: 'host-1' } });
    mockEventFindUnique.mockResolvedValue({
      ownerId: 'host-1',
      title: 'Game Night',
      startAt: futureDate,
      timezone: 'UTC',
      owner: { name: 'Bob' },
      attendees: [
        {
          userId: 'user-2',
          user: { id: 'user-2', name: 'Alice', email: 'alice@example.com' },
        },
      ],
    });
    mockIsEmailEnabledForUser.mockResolvedValue(true);
    mockSendEventCancelledEmail.mockRejectedValue(new Error('Resend down'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'DELETE',
    });

    const res = await DELETE(req, {
      params: Promise.resolve({ id: 'evt-1' }),
    });
    // Delete still succeeds
    expect(res.status).toBe(200);
    expect(mockEventDelete).toHaveBeenCalledWith({ where: { id: 'evt-1' } });

    await new Promise((r) => setTimeout(r, 50));
    consoleSpy.mockRestore();
  });
});
