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
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    attendee: {
      findUnique: (...args: unknown[]) => mockAttendeeFindUnique(...args),
      update: (...args: unknown[]) => mockAttendeeUpdate(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// POST /api/events/:id/rsvp — Accept / Decline invitation
// ---------------------------------------------------------------------------

describe('POST /api/events/:id/rsvp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    mockAttendeeFindUnique.mockResolvedValue({
      id: 'att-1',
      eventId: 'evt-1',
      userId: 'user-1',
      status: 'INVITED',
      role: 'ATTENDEE',
      event: { endAt: futureDate },
    });
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
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    mockAttendeeFindUnique.mockResolvedValue({
      id: 'att-1',
      eventId: 'evt-1',
      userId: 'user-1',
      status: 'INVITED',
      role: 'ATTENDEE',
      event: { endAt: futureDate },
    });
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
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday
    mockAttendeeFindUnique.mockResolvedValue({
      id: 'att-1',
      eventId: 'evt-old',
      userId: 'user-1',
      status: 'INVITED',
      role: 'ATTENDEE',
      event: { endAt: pastDate },
    });

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
    mockAttendeeFindUnique.mockResolvedValue({
      id: 'att-1',
      eventId: 'evt-old',
      userId: 'user-1',
      status: 'INVITED',
      role: 'ATTENDEE',
      event: { endAt: pastDate },
    });
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
// Error handler: DB error → 500
// ---------------------------------------------------------------------------

describe('POST /api/events/:id/rsvp error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 500 on unexpected DB error', async () => {
    const { POST } = await import('@/app/api/events/[id]/rsvp/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    mockAttendeeFindUnique.mockResolvedValue({
      id: 'att-1',
      eventId: 'evt-1',
      userId: 'user-1',
      status: 'INVITED',
      role: 'ATTENDEE',
      event: { endAt: futureDate },
    });
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
