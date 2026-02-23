import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetSession = vi.fn();

vi.mock('@/lib/auth', () => ({
  getSession: () => mockGetSession(),
}));

const mockEventFindMany = vi.fn();
const mockEventCreate = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    event: {
      findMany: (...args: unknown[]) => mockEventFindMany(...args),
      create: (...args: unknown[]) => mockEventCreate(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// GET /api/events
// ---------------------------------------------------------------------------

describe('GET /api/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const { GET } = await import('@/app/api/events/route');
    mockGetSession.mockResolvedValue(null);

    const url = new URL('http://localhost/api/events');
    const req = new NextRequest(url);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns events for authenticated user with valid params', async () => {
    const { GET } = await import('@/app/api/events/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

    const now = new Date();
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const mockEvents = [
      {
        id: 'evt-1',
        ownerId: 'user-1',
        title: 'My Event',
        startAt: now,
        endAt: weekEnd,
        attendees: [],
      },
    ];
    mockEventFindMany.mockResolvedValue(mockEvents);

    const url = new URL('http://localhost/api/events');
    url.searchParams.set('from', now.toISOString());
    url.searchParams.set('to', weekEnd.toISOString());
    const req = new NextRequest(url);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('evt-1');
  });

  it('returns events without date filters', async () => {
    const { GET } = await import('@/app/api/events/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockEventFindMany.mockResolvedValue([]);

    const url = new URL('http://localhost/api/events');
    const req = new NextRequest(url);
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it('returns events with only from param', async () => {
    const { GET } = await import('@/app/api/events/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockEventFindMany.mockResolvedValue([]);

    const url = new URL('http://localhost/api/events');
    url.searchParams.set('from', new Date().toISOString());
    const req = new NextRequest(url);
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it('returns events with only to param', async () => {
    const { GET } = await import('@/app/api/events/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockEventFindMany.mockResolvedValue([]);

    const url = new URL('http://localhost/api/events');
    url.searchParams.set('to', new Date().toISOString());
    const req = new NextRequest(url);
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid query params', async () => {
    const { GET } = await import('@/app/api/events/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

    const url = new URL('http://localhost/api/events');
    url.searchParams.set('from', 'not-a-date');
    const req = new NextRequest(url);
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid query parameters');
  });

  it('returns 500 on unexpected DB error', async () => {
    const { GET } = await import('@/app/api/events/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockEventFindMany.mockRejectedValue(new Error('DB down'));

    const now = new Date();
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const url = new URL('http://localhost/api/events');
    url.searchParams.set('from', now.toISOString());
    url.searchParams.set('to', weekEnd.toISOString());
    const req = new NextRequest(url);
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/events
// ---------------------------------------------------------------------------

describe('POST /api/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validBody = {
    title: 'New Event',
    startAt: '2025-07-01T10:00:00.000Z',
    endAt: '2025-07-01T12:00:00.000Z',
    timezone: 'America/New_York',
    visibility: 'PRIVATE',
    coverMode: 'NONE',
    syncToGoogle: false,
  };

  it('returns 401 when not authenticated', async () => {
    const { POST } = await import('@/app/api/events/route');
    mockGetSession.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/events', {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('creates an event with valid data', async () => {
    const { POST } = await import('@/app/api/events/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockEventCreate.mockResolvedValue({
      id: 'evt-new',
      ownerId: 'user-1',
      title: 'New Event',
      startAt: new Date('2025-07-01T10:00:00.000Z'),
      endAt: new Date('2025-07-01T12:00:00.000Z'),
      attendees: [
        {
          id: 'att-1',
          userId: 'user-1',
          status: 'GOING',
          role: 'HOST',
          anonymity: 'NAMED',
        },
      ],
    });

    const req = new NextRequest('http://localhost/api/events', {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('evt-new');
    expect(body.title).toBe('New Event');
  });

  it('returns 400 when endAt is before startAt', async () => {
    const { POST } = await import('@/app/api/events/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

    const req = new NextRequest('http://localhost/api/events', {
      method: 'POST',
      body: JSON.stringify({
        ...validBody,
        startAt: '2025-07-01T12:00:00.000Z',
        endAt: '2025-07-01T10:00:00.000Z',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Event end time must be after start time');
  });

  it('returns 400 for invalid request body (Zod)', async () => {
    const { POST } = await import('@/app/api/events/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

    const req = new NextRequest('http://localhost/api/events', {
      method: 'POST',
      body: JSON.stringify({ title: '' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid request body');
  });

  it('returns 500 on unexpected DB error', async () => {
    const { POST } = await import('@/app/api/events/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockEventCreate.mockRejectedValue(new Error('DB down'));

    const req = new NextRequest('http://localhost/api/events', {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it('uses default values when optional fields are omitted', async () => {
    const { POST } = await import('@/app/api/events/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockEventCreate.mockResolvedValue({
      id: 'evt-min',
      ownerId: 'user-1',
      title: 'Minimal Event',
      attendees: [],
    });

    const req = new NextRequest('http://localhost/api/events', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Minimal Event',
        startAt: '2025-07-01T10:00:00.000Z',
        endAt: '2025-07-01T12:00:00.000Z',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    // Verify defaults were applied
    const createCall = mockEventCreate.mock.calls[0][0];
    expect(createCall.data.timezone).toBe('UTC');
    expect(createCall.data.visibility).toBe('PRIVATE');
    expect(createCall.data.coverMode).toBe('NONE');
    expect(createCall.data.syncToGoogle).toBe(false);
  });
});
