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

const mockIsEmailEnabledForUser = vi.fn();
const mockSendEventUpdatedEmail = vi.fn();
const mockSendEventCancelledEmail = vi.fn();

vi.mock('@/lib/email', () => ({
  isEmailEnabledForUser: (...args: unknown[]) =>
    mockIsEmailEnabledForUser(...args),
  sendEventUpdatedEmail: (...args: unknown[]) =>
    mockSendEventUpdatedEmail(...args),
  sendEventCancelledEmail: (...args: unknown[]) =>
    mockSendEventCancelledEmail(...args),
}));

vi.mock('@/lib/policies/eventAccess', () => ({
  isAttendeeAnonymous: (anonymity: string) => anonymity === 'ANONYMOUS',
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const session = { user: { id: 'host-1', name: 'Host' } };

const namedAttendee = {
  id: 'att-1',
  userId: 'user-2',
  status: 'GOING',
  anonymity: 'NAMED',
  role: 'ATTENDEE',
  user: { id: 'user-2', name: 'Alice', email: 'alice@test.com' },
};

const anonAttendee = {
  id: 'att-2',
  userId: 'user-3',
  status: 'GOING',
  anonymity: 'ANONYMOUS',
  role: 'ATTENDEE',
  user: { id: 'user-3', name: 'Bob', email: 'bob@test.com' },
};

const baseEvent = {
  id: 'evt-1',
  ownerId: 'host-1',
  title: 'Test Event',
  description: 'A test event',
  startAt: new Date('2026-03-10T10:00:00Z'),
  endAt: new Date('2026-03-10T12:00:00Z'),
  timezone: 'America/New_York',
  locationName: 'NYC',
  visibility: 'FRIENDS',
  coverMode: 'NONE',
  syncToGoogle: false,
  owner: { id: 'host-1', name: 'Host', email: 'host@test.com' },
  attendees: [namedAttendee, anonAttendee],
};

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// GET /api/events/:id
// ---------------------------------------------------------------------------

describe('GET /api/events/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const { GET } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/events/evt-1');
    const res = await GET(req, makeParams('evt-1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when event not found', async () => {
    const { GET } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/events/missing');
    const res = await GET(req, makeParams('missing'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when user is neither owner nor attendee', async () => {
    const { GET } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue({ user: { id: 'stranger' } });
    mockEventFindUnique.mockResolvedValue(baseEvent);

    const req = new NextRequest('http://localhost/api/events/evt-1');
    const res = await GET(req, makeParams('evt-1'));
    expect(res.status).toBe(403);
  });

  it('returns full attendee list for owner (no redaction)', async () => {
    const { GET } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue(baseEvent);

    const req = new NextRequest('http://localhost/api/events/evt-1');
    const res = await GET(req, makeParams('evt-1'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.attendees).toHaveLength(2);
    // Owner sees all names including anonymous
    expect(body.attendees[0].name).toBe('Alice');
    expect(body.attendees[1].name).toBe('Bob');
    expect(body.attendees[1].userId).toBe('user-3');
  });

  it('redacts anonymous attendees for non-owner attendee', async () => {
    const { GET } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-2' } });
    mockEventFindUnique.mockResolvedValue(baseEvent);

    const req = new NextRequest('http://localhost/api/events/evt-1');
    const res = await GET(req, makeParams('evt-1'));
    expect(res.status).toBe(200);

    const body = await res.json();
    // Named attendee (self) visible
    expect(body.attendees[0].name).toBe('Alice');
    // Anonymous attendee redacted
    expect(body.attendees[1].name).toBe('Anonymous attendee');
    expect(body.attendees[1].userId).toBeNull();
    expect(body.attendees[1].email).toBeNull();
  });

  it('returns 500 on DB error', async () => {
    const { GET } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockRejectedValue(new Error('DB down'));

    const req = new NextRequest('http://localhost/api/events/evt-1');
    const res = await GET(req, makeParams('evt-1'));
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/events/:id
// ---------------------------------------------------------------------------

describe('PATCH /api/events/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const { PATCH } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated' }),
    });
    const res = await PATCH(req, makeParams('evt-1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when event not found', async () => {
    const { PATCH } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/events/missing', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated' }),
    });
    const res = await PATCH(req, makeParams('missing'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when non-owner tries to update', async () => {
    const { PATCH } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue({ user: { id: 'stranger' } });
    mockEventFindUnique.mockResolvedValue({
      ownerId: 'host-1',
      startAt: baseEvent.startAt,
      endAt: baseEvent.endAt,
    });

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated' }),
    });
    const res = await PATCH(req, makeParams('evt-1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when endAt is before startAt', async () => {
    const { PATCH } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue({
      ownerId: 'host-1',
      startAt: baseEvent.startAt,
      endAt: baseEvent.endAt,
    });

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'PATCH',
      body: JSON.stringify({
        startAt: '2026-03-10T14:00:00Z',
        endAt: '2026-03-10T10:00:00Z',
      }),
    });
    const res = await PATCH(req, makeParams('evt-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('end time must be after start time');
  });

  it('returns 400 for invalid request body', async () => {
    const { PATCH } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue({
      ownerId: 'host-1',
      startAt: baseEvent.startAt,
      endAt: baseEvent.endAt,
    });

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'PATCH',
      body: JSON.stringify({ title: '' }), // min 1 char
    });
    const res = await PATCH(req, makeParams('evt-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid request body');
  });

  it('updates event with non-material fields (no emails)', async () => {
    const { PATCH } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue({
      ownerId: 'host-1',
      startAt: baseEvent.startAt,
      endAt: baseEvent.endAt,
    });
    const updatedEvent = { ...baseEvent, title: 'New Title', attendees: [] };
    mockEventUpdate.mockResolvedValue(updatedEvent);

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'New Title' }),
    });
    const res = await PATCH(req, makeParams('evt-1'));
    expect(res.status).toBe(200);
    // No material change = no attendee lookup
    expect(mockAttendeeFindMany).not.toHaveBeenCalled();
  });

  it('sends update emails when material fields change', async () => {
    const { PATCH } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue({
      ownerId: 'host-1',
      startAt: baseEvent.startAt,
      endAt: baseEvent.endAt,
    });
    const updatedEvent = { ...baseEvent, attendees: [] };
    mockEventUpdate.mockResolvedValue(updatedEvent);
    mockAttendeeFindMany.mockResolvedValue([
      {
        user: { id: 'user-2', name: 'Alice', email: 'alice@test.com' },
      },
    ]);
    mockIsEmailEnabledForUser.mockResolvedValue(true);
    mockSendEventUpdatedEmail.mockResolvedValue(undefined);

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'PATCH',
      body: JSON.stringify({
        locationName: 'New Location',
      }),
    });
    const res = await PATCH(req, makeParams('evt-1'));
    expect(res.status).toBe(200);
    expect(mockAttendeeFindMany).toHaveBeenCalled();

    // Wait for fire-and-forget promises
    await new Promise((r) => setTimeout(r, 50));
    expect(mockIsEmailEnabledForUser).toHaveBeenCalledWith('user-2');
    expect(mockSendEventUpdatedEmail).toHaveBeenCalled();
  });

  it('skips email when email is disabled for attendee', async () => {
    const { PATCH } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue({
      ownerId: 'host-1',
      startAt: baseEvent.startAt,
      endAt: baseEvent.endAt,
    });
    const updatedEvent = { ...baseEvent, attendees: [] };
    mockEventUpdate.mockResolvedValue(updatedEvent);
    mockAttendeeFindMany.mockResolvedValue([
      {
        user: { id: 'user-2', name: 'Alice', email: 'alice@test.com' },
      },
    ]);
    mockIsEmailEnabledForUser.mockResolvedValue(false);

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'PATCH',
      body: JSON.stringify({ startAt: '2026-03-11T10:00:00Z' }),
    });
    const res = await PATCH(req, makeParams('evt-1'));
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));
    expect(mockIsEmailEnabledForUser).toHaveBeenCalledWith('user-2');
    expect(mockSendEventUpdatedEmail).not.toHaveBeenCalled();
  });

  it('handles email send failure gracefully', async () => {
    const { PATCH } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue({
      ownerId: 'host-1',
      startAt: baseEvent.startAt,
      endAt: baseEvent.endAt,
    });
    const updatedEvent = { ...baseEvent, attendees: [] };
    mockEventUpdate.mockResolvedValue(updatedEvent);
    mockAttendeeFindMany.mockResolvedValue([
      {
        user: { id: 'user-2', name: 'Alice', email: 'alice@test.com' },
      },
    ]);
    mockIsEmailEnabledForUser.mockResolvedValue(true);
    mockSendEventUpdatedEmail.mockRejectedValue(new Error('SMTP error'));

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'PATCH',
      body: JSON.stringify({ locationName: 'New Spot' }),
    });
    const res = await PATCH(req, makeParams('evt-1'));
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));
    expect(mockSendEventUpdatedEmail).toHaveBeenCalled();
  });

  it('returns 500 on DB error', async () => {
    const { PATCH } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockRejectedValue(new Error('DB down'));

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated' }),
    });
    const res = await PATCH(req, makeParams('evt-1'));
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/events/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const { DELETE } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'DELETE',
    });
    const res = await DELETE(req, makeParams('evt-1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when event not found', async () => {
    const { DELETE } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/events/missing', {
      method: 'DELETE',
    });
    const res = await DELETE(req, makeParams('missing'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when non-owner tries to delete', async () => {
    const { DELETE } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue({ user: { id: 'stranger' } });
    mockEventFindUnique.mockResolvedValue({
      ...baseEvent,
      attendees: [],
    });

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'DELETE',
    });
    const res = await DELETE(req, makeParams('evt-1'));
    expect(res.status).toBe(403);
  });

  it('deletes event with no attendees to notify', async () => {
    const { DELETE } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue({
      ...baseEvent,
      attendees: [],
    });
    mockEventDelete.mockResolvedValue({});

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'DELETE',
    });
    const res = await DELETE(req, makeParams('evt-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockEventDelete).toHaveBeenCalledWith({ where: { id: 'evt-1' } });
  });

  it('sends cancellation emails when deleting event with attendees', async () => {
    const { DELETE } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue({
      ...baseEvent,
      attendees: [namedAttendee],
    });
    mockEventDelete.mockResolvedValue({});
    mockIsEmailEnabledForUser.mockResolvedValue(true);
    mockSendEventCancelledEmail.mockResolvedValue(undefined);

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'DELETE',
    });
    const res = await DELETE(req, makeParams('evt-1'));
    expect(res.status).toBe(200);

    // Wait for fire-and-forget promises
    await new Promise((r) => setTimeout(r, 50));
    expect(mockIsEmailEnabledForUser).toHaveBeenCalledWith('user-2');
    expect(mockSendEventCancelledEmail).toHaveBeenCalled();
  });

  it('skips cancellation email when email is disabled', async () => {
    const { DELETE } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue({
      ...baseEvent,
      attendees: [namedAttendee],
    });
    mockEventDelete.mockResolvedValue({});
    mockIsEmailEnabledForUser.mockResolvedValue(false);

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'DELETE',
    });
    const res = await DELETE(req, makeParams('evt-1'));
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));
    expect(mockIsEmailEnabledForUser).toHaveBeenCalledWith('user-2');
    expect(mockSendEventCancelledEmail).not.toHaveBeenCalled();
  });

  it('handles cancellation email failure gracefully', async () => {
    const { DELETE } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockResolvedValue({
      ...baseEvent,
      attendees: [namedAttendee],
    });
    mockEventDelete.mockResolvedValue({});
    mockIsEmailEnabledForUser.mockResolvedValue(true);
    mockSendEventCancelledEmail.mockRejectedValue(new Error('SMTP error'));

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'DELETE',
    });
    const res = await DELETE(req, makeParams('evt-1'));
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));
    expect(mockSendEventCancelledEmail).toHaveBeenCalled();
  });

  it('returns 500 on DB error', async () => {
    const { DELETE } = await import('@/app/api/events/[id]/route');
    mockGetSession.mockResolvedValue(session);
    mockEventFindUnique.mockRejectedValue(new Error('DB down'));

    const req = new NextRequest('http://localhost/api/events/evt-1', {
      method: 'DELETE',
    });
    const res = await DELETE(req, makeParams('evt-1'));
    expect(res.status).toBe(500);
  });
});
