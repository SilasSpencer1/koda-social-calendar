import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetSession = vi.fn();

vi.mock('@/lib/auth', () => ({
  getSession: () => mockGetSession(),
}));

const mockAttendeeFindUnique = vi.fn();
const mockAttendeeUpdate = vi.fn();
const mockNotificationCreate = vi.fn();
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    attendee: {
      findUnique: (...args: unknown[]) => mockAttendeeFindUnique(...args),
      update: (...args: unknown[]) => mockAttendeeUpdate(...args),
    },
    notification: {
      create: (...args: unknown[]) => mockNotificationCreate(...args),
    },
  },
}));

const mockIsEmailEnabledForUser = vi.fn();
const mockSendRsvpAcceptedEmail = vi.fn();
const mockSendRsvpDeclinedEmail = vi.fn();
vi.mock('@/lib/email', () => ({
  isEmailEnabledForUser: (...args: unknown[]) =>
    mockIsEmailEnabledForUser(...args),
  sendRsvpAcceptedEmail: (...args: unknown[]) =>
    mockSendRsvpAcceptedEmail(...args),
  sendRsvpDeclinedEmail: (...args: unknown[]) =>
    mockSendRsvpDeclinedEmail(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

function makeAttendee(overrides = {}) {
  return {
    id: 'att-1',
    eventId: 'evt-1',
    userId: 'user-1',
    status: 'INVITED',
    role: 'ATTENDEE',
    event: {
      id: 'evt-1',
      title: 'Game Night',
      endAt: futureDate,
      ownerId: 'host-1',
      owner: { id: 'host-1', name: 'Bob', email: 'bob@example.com' },
    },
    user: { name: 'Alice' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /api/events/:id/rsvp — Accept / Decline invitation
// ---------------------------------------------------------------------------

describe('POST /api/events/:id/rsvp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsEmailEnabledForUser.mockResolvedValue(false);
    mockSendRsvpAcceptedEmail.mockResolvedValue(undefined);
    mockSendRsvpDeclinedEmail.mockResolvedValue(undefined);
    mockNotificationCreate.mockResolvedValue({ id: 'notif-1' });
  });

  it('returns 401 when not authenticated', async () => {
    const { POST } = await import('@/app/api/events/[id]/rsvp/route');
    mockGetSession.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/events/evt-1/rsvp', {
      method: 'POST',
      body: JSON.stringify({ status: 'GOING' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, {
      params: Promise.resolve({ id: 'evt-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when user is not invited', async () => {
    const { POST } = await import('@/app/api/events/[id]/rsvp/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockAttendeeFindUnique.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/events/evt-1/rsvp', {
      method: 'POST',
      body: JSON.stringify({ status: 'GOING' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, {
      params: Promise.resolve({ id: 'evt-1' }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('You are not invited to this event');
  });

  it('accepts an invitation (INVITED → GOING)', async () => {
    const { POST } = await import('@/app/api/events/[id]/rsvp/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockAttendeeFindUnique.mockResolvedValue(makeAttendee());
    mockAttendeeUpdate.mockResolvedValue({
      id: 'att-1',
      eventId: 'evt-1',
      userId: 'user-1',
      status: 'GOING',
      role: 'ATTENDEE',
    });

    const req = new NextRequest('http://localhost/api/events/evt-1/rsvp', {
      method: 'POST',
      body: JSON.stringify({ status: 'GOING' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, {
      params: Promise.resolve({ id: 'evt-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('GOING');

    // Verify correct Prisma call
    expect(mockAttendeeUpdate).toHaveBeenCalledWith({
      where: { id: 'att-1' },
      data: { status: 'GOING' },
    });
  });

  it('declines an invitation (INVITED → DECLINED)', async () => {
    const { POST } = await import('@/app/api/events/[id]/rsvp/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockAttendeeFindUnique.mockResolvedValue(makeAttendee());
    mockAttendeeUpdate.mockResolvedValue({
      id: 'att-1',
      eventId: 'evt-1',
      userId: 'user-1',
      status: 'DECLINED',
      role: 'ATTENDEE',
    });

    const req = new NextRequest('http://localhost/api/events/evt-1/rsvp', {
      method: 'POST',
      body: JSON.stringify({ status: 'DECLINED' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, {
      params: Promise.resolve({ id: 'evt-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('DECLINED');
  });

  it('rejects invalid RSVP status', async () => {
    const { POST } = await import('@/app/api/events/[id]/rsvp/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

    const req = new NextRequest('http://localhost/api/events/evt-1/rsvp', {
      method: 'POST',
      body: JSON.stringify({ status: 'MAYBE' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, {
      params: Promise.resolve({ id: 'evt-1' }),
    });
    expect(res.status).toBe(400);
  });

  it('blocks accepting a past event', async () => {
    const { POST } = await import('@/app/api/events/[id]/rsvp/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    mockAttendeeFindUnique.mockResolvedValue(
      makeAttendee({
        event: {
          id: 'evt-old',
          title: 'Past Event',
          endAt: pastDate,
          ownerId: 'host-1',
          owner: { id: 'host-1', name: 'Bob', email: 'bob@example.com' },
        },
      })
    );

    const req = new NextRequest('http://localhost/api/events/evt-old/rsvp', {
      method: 'POST',
      body: JSON.stringify({ status: 'GOING' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, {
      params: Promise.resolve({ id: 'evt-old' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('This event has already ended');
  });

  it('allows declining a past event', async () => {
    const { POST } = await import('@/app/api/events/[id]/rsvp/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    mockAttendeeFindUnique.mockResolvedValue(
      makeAttendee({
        eventId: 'evt-old',
        event: {
          id: 'evt-old',
          title: 'Past Event',
          endAt: pastDate,
          ownerId: 'host-1',
          owner: { id: 'host-1', name: 'Bob', email: 'bob@example.com' },
        },
      })
    );
    mockAttendeeUpdate.mockResolvedValue({
      id: 'att-1',
      eventId: 'evt-old',
      userId: 'user-1',
      status: 'DECLINED',
      role: 'ATTENDEE',
    });

    const req = new NextRequest('http://localhost/api/events/evt-old/rsvp', {
      method: 'POST',
      body: JSON.stringify({ status: 'DECLINED' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, {
      params: Promise.resolve({ id: 'evt-old' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('DECLINED');
  });
});

// ---------------------------------------------------------------------------
// Host notification on RSVP
// ---------------------------------------------------------------------------

describe('POST /api/events/:id/rsvp — host notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsEmailEnabledForUser.mockResolvedValue(false);
    mockSendRsvpAcceptedEmail.mockResolvedValue(undefined);
    mockSendRsvpDeclinedEmail.mockResolvedValue(undefined);
    mockNotificationCreate.mockResolvedValue({ id: 'notif-1' });
  });

  it('creates in-app notification for host on accept', async () => {
    const { POST } = await import('@/app/api/events/[id]/rsvp/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockAttendeeFindUnique.mockResolvedValue(makeAttendee());
    mockAttendeeUpdate.mockResolvedValue({
      id: 'att-1',
      status: 'GOING',
    });

    const req = new NextRequest('http://localhost/api/events/evt-1/rsvp', {
      method: 'POST',
      body: JSON.stringify({ status: 'GOING' }),
      headers: { 'Content-Type': 'application/json' },
    });

    await POST(req, { params: Promise.resolve({ id: 'evt-1' }) });

    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    const call = mockNotificationCreate.mock.calls[0][0];
    expect(call.data.userId).toBe('host-1');
    expect(call.data.title).toContain('Alice');
    expect(call.data.title).toContain('going');
    expect(call.data.href).toBe('/app/events/evt-1');
  });

  it('creates in-app notification for host on decline', async () => {
    const { POST } = await import('@/app/api/events/[id]/rsvp/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockAttendeeFindUnique.mockResolvedValue(makeAttendee());
    mockAttendeeUpdate.mockResolvedValue({
      id: 'att-1',
      status: 'DECLINED',
    });

    const req = new NextRequest('http://localhost/api/events/evt-1/rsvp', {
      method: 'POST',
      body: JSON.stringify({ status: 'DECLINED' }),
      headers: { 'Content-Type': 'application/json' },
    });

    await POST(req, { params: Promise.resolve({ id: 'evt-1' }) });

    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    const call = mockNotificationCreate.mock.calls[0][0];
    expect(call.data.userId).toBe('host-1');
    expect(call.data.title).toContain('declined');
  });

  it('sends RSVP accepted email to host when email is enabled', async () => {
    const { POST } = await import('@/app/api/events/[id]/rsvp/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockAttendeeFindUnique.mockResolvedValue(makeAttendee());
    mockAttendeeUpdate.mockResolvedValue({ id: 'att-1', status: 'GOING' });
    mockIsEmailEnabledForUser.mockResolvedValue(true);

    const req = new NextRequest('http://localhost/api/events/evt-1/rsvp', {
      method: 'POST',
      body: JSON.stringify({ status: 'GOING' }),
      headers: { 'Content-Type': 'application/json' },
    });

    await POST(req, { params: Promise.resolve({ id: 'evt-1' }) });

    // Wait for fire-and-forget promise chain
    await new Promise((r) => setTimeout(r, 50));

    expect(mockIsEmailEnabledForUser).toHaveBeenCalledWith('host-1');
    expect(mockSendRsvpAcceptedEmail).toHaveBeenCalledTimes(1);
    expect(mockSendRsvpAcceptedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'bob@example.com',
        hostName: 'Bob',
        attendeeName: 'Alice',
        eventTitle: 'Game Night',
        eventId: 'evt-1',
      })
    );
  });

  it('does not notify host when user is the host', async () => {
    const { POST } = await import('@/app/api/events/[id]/rsvp/route');
    // User is the host RSVPing to their own event
    mockGetSession.mockResolvedValue({ user: { id: 'host-1' } });
    mockAttendeeFindUnique.mockResolvedValue(
      makeAttendee({
        userId: 'host-1',
        user: { name: 'Bob' },
      })
    );
    mockAttendeeUpdate.mockResolvedValue({ id: 'att-1', status: 'GOING' });

    const req = new NextRequest('http://localhost/api/events/evt-1/rsvp', {
      method: 'POST',
      body: JSON.stringify({ status: 'GOING' }),
      headers: { 'Content-Type': 'application/json' },
    });

    await POST(req, { params: Promise.resolve({ id: 'evt-1' }) });

    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockIsEmailEnabledForUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Error handler: DB error → 500
// ---------------------------------------------------------------------------

describe('POST /api/events/:id/rsvp error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 500 on unexpected DB error', async () => {
    const { POST } = await import('@/app/api/events/[id]/rsvp/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockAttendeeFindUnique.mockResolvedValue(makeAttendee());
    mockAttendeeUpdate.mockRejectedValue(new Error('DB down'));

    const req = new NextRequest('http://localhost/api/events/evt-1/rsvp', {
      method: 'POST',
      body: JSON.stringify({ status: 'GOING' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, {
      params: Promise.resolve({ id: 'evt-1' }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});
