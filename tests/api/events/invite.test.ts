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
const mockUserFindMany = vi.fn();
const mockFriendshipFindMany = vi.fn();
const mockAttendeeCreate = vi.fn();
const mockNotificationCreate = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    event: {
      findUnique: (...args: unknown[]) => mockEventFindUnique(...args),
    },
    user: {
      findMany: (...args: unknown[]) => mockUserFindMany(...args),
    },
    friendship: {
      findMany: (...args: unknown[]) => mockFriendshipFindMany(...args),
    },
    attendee: {
      create: (...args: unknown[]) => mockAttendeeCreate(...args),
    },
    notification: {
      create: (...args: unknown[]) => mockNotificationCreate(...args),
    },
  },
}));

const mockIsEmailEnabledForUser = vi.fn();
const mockSendInviteEmail = vi.fn();

vi.mock('@/lib/email', () => ({
  isEmailEnabledForUser: (...args: unknown[]) =>
    mockIsEmailEnabledForUser(...args),
  sendInviteEmail: (...args: unknown[]) => mockSendInviteEmail(...args),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const session = { user: { id: 'host-1', name: 'Host' } };

const baseEvent = {
  id: 'evt-1',
  ownerId: 'host-1',
  title: 'Test Event',
  startAt: new Date('2026-03-10T10:00:00Z'),
  timezone: 'America/New_York',
  attendees: [],
};

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/events/evt-1/invite', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// POST /api/events/:id/invite
// ---------------------------------------------------------------------------

describe('POST /api/events/:id/invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const { POST } = await import('@/app/api/events/[id]/invite/route');
    mockGetSession.mockResolvedValue(null);

    const res = await POST(makeReq({ userIds: ['u1'] }), makeParams('evt-1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when event not found', async () => {
    const { POST } = await import('@/app/api/events/[id]/invite/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue(null);

    const res = await POST(makeReq({ userIds: ['u1'] }), makeParams('missing'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when non-owner tries to invite', async () => {
    const { POST } = await import('@/app/api/events/[id]/invite/route');
    mockGetSession.mockResolvedValue({ user: { id: 'stranger' } });
    mockEventFindUnique.mockResolvedValue(baseEvent);

    const res = await POST(makeReq({ userIds: ['u1'] }), makeParams('evt-1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid body (empty userIds)', async () => {
    const { POST } = await import('@/app/api/events/[id]/invite/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue(baseEvent);

    const res = await POST(makeReq({ userIds: [] }), makeParams('evt-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid request body');
  });

  it('returns 400 when user not found in DB', async () => {
    const { POST } = await import('@/app/api/events/[id]/invite/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue(baseEvent);
    // Only 1 user found out of 2 requested
    mockUserFindMany.mockResolvedValue([
      { id: 'u1', email: 'u1@test.com', name: 'User 1' },
    ]);

    const res = await POST(
      makeReq({ userIds: ['u1', 'u2'] }),
      makeParams('evt-1')
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('not found');
  });

  it('returns 400 when all invitees are blocked or non-friends', async () => {
    const { POST } = await import('@/app/api/events/[id]/invite/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue(baseEvent);
    mockUserFindMany.mockResolvedValue([
      { id: 'u1', email: 'u1@test.com', name: 'User 1' },
    ]);
    // No blocked, but also no accepted friendships
    mockFriendshipFindMany
      .mockResolvedValueOnce([]) // blocked
      .mockResolvedValueOnce([]); // accepted

    const res = await POST(makeReq({ userIds: ['u1'] }), makeParams('evt-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No valid invitees');
  });

  it('filters out blocked users from invitees', async () => {
    const { POST } = await import('@/app/api/events/[id]/invite/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue(baseEvent);
    mockUserFindMany.mockResolvedValue([
      { id: 'u1', email: 'u1@test.com', name: 'User 1' },
    ]);
    // u1 is blocked
    mockFriendshipFindMany
      .mockResolvedValueOnce([{ requesterId: 'host-1', addresseeId: 'u1' }]) // blocked
      .mockResolvedValueOnce([]); // accepted (none)

    const res = await POST(makeReq({ userIds: ['u1'] }), makeParams('evt-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No valid invitees');
  });

  it('filters mixed: one blocked, one friend, invites only friend', async () => {
    const { POST } = await import('@/app/api/events/[id]/invite/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue(baseEvent);
    mockUserFindMany.mockResolvedValue([
      { id: 'u1', email: 'u1@test.com', name: 'User 1' },
      { id: 'u2', email: 'u2@test.com', name: 'User 2' },
    ]);
    // u1 is blocked, u2 is a friend
    mockFriendshipFindMany
      .mockResolvedValueOnce([{ requesterId: 'u1', addresseeId: 'host-1' }]) // blocked
      .mockResolvedValueOnce([{ requesterId: 'host-1', addresseeId: 'u2' }]); // accepted

    const createdAttendee = {
      id: 'att-new',
      eventId: 'evt-1',
      userId: 'u2',
      status: 'INVITED',
    };
    mockAttendeeCreate.mockResolvedValue(createdAttendee);
    mockNotificationCreate.mockResolvedValue({});
    mockIsEmailEnabledForUser.mockResolvedValue(false);

    const res = await POST(
      makeReq({ userIds: ['u1', 'u2'] }),
      makeParams('evt-1')
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.inviteCount).toBe(1);
  });

  it('returns 400 when all users already invited', async () => {
    const { POST } = await import('@/app/api/events/[id]/invite/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue({
      ...baseEvent,
      attendees: [{ userId: 'u1' }],
    });
    mockUserFindMany.mockResolvedValue([
      { id: 'u1', email: 'u1@test.com', name: 'User 1' },
    ]);
    mockFriendshipFindMany
      .mockResolvedValueOnce([]) // blocked
      .mockResolvedValueOnce([{ requesterId: 'host-1', addresseeId: 'u1' }]); // accepted

    const res = await POST(makeReq({ userIds: ['u1'] }), makeParams('evt-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('already invited');
  });

  it('creates attendee records and returns 201', async () => {
    const { POST } = await import('@/app/api/events/[id]/invite/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue(baseEvent);
    mockUserFindMany.mockResolvedValue([
      { id: 'u1', email: 'u1@test.com', name: 'User 1' },
    ]);
    mockFriendshipFindMany
      .mockResolvedValueOnce([]) // blocked
      .mockResolvedValueOnce([{ requesterId: 'host-1', addresseeId: 'u1' }]); // accepted

    const createdAttendee = {
      id: 'att-new',
      eventId: 'evt-1',
      userId: 'u1',
      status: 'INVITED',
    };
    mockAttendeeCreate.mockResolvedValue(createdAttendee);
    mockNotificationCreate.mockResolvedValue({});
    mockIsEmailEnabledForUser.mockResolvedValue(true);
    mockSendInviteEmail.mockResolvedValue(undefined);

    const res = await POST(makeReq({ userIds: ['u1'] }), makeParams('evt-1'));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.inviteCount).toBe(1);
    expect(mockAttendeeCreate).toHaveBeenCalled();
    expect(mockNotificationCreate).toHaveBeenCalled();
  });

  it('returns 500 on unexpected DB error', async () => {
    const { POST } = await import('@/app/api/events/[id]/invite/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockRejectedValue(new Error('DB down'));

    const res = await POST(makeReq({ userIds: ['u1'] }), makeParams('evt-1'));
    expect(res.status).toBe(500);
  });
});
