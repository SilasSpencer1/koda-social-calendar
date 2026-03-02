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

const mockSendInviteEmail = vi.fn();
const mockIsEmailEnabledForUser = vi.fn();
vi.mock('@/lib/email', () => ({
  sendInviteEmail: (...args: unknown[]) => mockSendInviteEmail(...args),
  isEmailEnabledForUser: (...args: unknown[]) =>
    mockIsEmailEnabledForUser(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

function setupSuccessfulInvite() {
  mockGetSession.mockResolvedValue({
    user: { id: 'host-1', name: 'Bob' },
  });
  mockEventFindUnique.mockResolvedValue({
    id: 'evt-1',
    ownerId: 'host-1',
    title: 'Game Night',
    startAt: futureDate,
    timezone: 'America/New_York',
    attendees: [],
  });
  mockUserFindMany.mockResolvedValue([
    { id: 'user-2', email: 'alice@example.com', name: 'Alice' },
  ]);
  // No blocked, one accepted friendship
  mockFriendshipFindMany
    .mockResolvedValueOnce([]) // blocked
    .mockResolvedValueOnce([{ requesterId: 'host-1', addresseeId: 'user-2' }]); // accepted
  mockAttendeeCreate.mockResolvedValue({
    id: 'att-1',
    eventId: 'evt-1',
    userId: 'user-2',
    status: 'INVITED',
  });
  mockNotificationCreate.mockResolvedValue({ id: 'notif-1' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/events/:id/invite — email notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsEmailEnabledForUser.mockResolvedValue(false);
    mockSendInviteEmail.mockResolvedValue(undefined);
  });

  it('sends invite email when user has email enabled', async () => {
    const { POST } = await import('@/app/api/events/[id]/invite/route');
    setupSuccessfulInvite();
    mockIsEmailEnabledForUser.mockResolvedValue(true);

    const req = new NextRequest('http://localhost/api/events/evt-1/invite', {
      method: 'POST',
      body: JSON.stringify({ userIds: ['user-2'] }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, {
      params: Promise.resolve({ id: 'evt-1' }),
    });
    expect(res.status).toBe(201);

    // Wait for fire-and-forget promise chain
    await new Promise((r) => setTimeout(r, 50));

    expect(mockIsEmailEnabledForUser).toHaveBeenCalledWith('user-2');
    expect(mockSendInviteEmail).toHaveBeenCalledTimes(1);
    expect(mockSendInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alice@example.com',
        inviteeName: 'Alice',
        hostName: 'Bob',
        eventTitle: 'Game Night',
        eventId: 'evt-1',
      })
    );
  });

  it('does not send email when user has email disabled', async () => {
    const { POST } = await import('@/app/api/events/[id]/invite/route');
    setupSuccessfulInvite();
    mockIsEmailEnabledForUser.mockResolvedValue(false);

    const req = new NextRequest('http://localhost/api/events/evt-1/invite', {
      method: 'POST',
      body: JSON.stringify({ userIds: ['user-2'] }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, {
      params: Promise.resolve({ id: 'evt-1' }),
    });
    expect(res.status).toBe(201);

    await new Promise((r) => setTimeout(r, 50));

    expect(mockIsEmailEnabledForUser).toHaveBeenCalledWith('user-2');
    expect(mockSendInviteEmail).not.toHaveBeenCalled();
  });

  it('still creates in-app notification regardless of email setting', async () => {
    const { POST } = await import('@/app/api/events/[id]/invite/route');
    setupSuccessfulInvite();
    mockIsEmailEnabledForUser.mockResolvedValue(false);

    const req = new NextRequest('http://localhost/api/events/evt-1/invite', {
      method: 'POST',
      body: JSON.stringify({ userIds: ['user-2'] }),
      headers: { 'Content-Type': 'application/json' },
    });

    await POST(req, { params: Promise.resolve({ id: 'evt-1' }) });

    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    const call = mockNotificationCreate.mock.calls[0][0];
    expect(call.data.userId).toBe('user-2');
    expect(call.data.type).toBe('EVENT_INVITE');
  });

  it('handles email send failure gracefully (does not break invite)', async () => {
    const { POST } = await import('@/app/api/events/[id]/invite/route');
    setupSuccessfulInvite();
    mockIsEmailEnabledForUser.mockResolvedValue(true);
    mockSendInviteEmail.mockRejectedValue(new Error('Resend down'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const req = new NextRequest('http://localhost/api/events/evt-1/invite', {
      method: 'POST',
      body: JSON.stringify({ userIds: ['user-2'] }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, {
      params: Promise.resolve({ id: 'evt-1' }),
    });
    // Invite still succeeds even if email fails
    expect(res.status).toBe(201);

    await new Promise((r) => setTimeout(r, 50));
    consoleSpy.mockRestore();
  });
});
