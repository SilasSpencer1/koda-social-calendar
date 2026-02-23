import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetSession = vi.fn();

vi.mock('@/lib/auth', () => ({
  getSession: () => mockGetSession(),
}));

const mockNotificationFindMany = vi.fn();
const mockNotificationFindUnique = vi.fn();
const mockNotificationUpdate = vi.fn();
const mockNotificationUpdateMany = vi.fn();
const mockNotificationCount = vi.fn();
const mockAttendeeFindMany = vi.fn();
const mockEventFindMany = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    notification: {
      findMany: (...args: unknown[]) => mockNotificationFindMany(...args),
      findUnique: (...args: unknown[]) => mockNotificationFindUnique(...args),
      update: (...args: unknown[]) => mockNotificationUpdate(...args),
      updateMany: (...args: unknown[]) => mockNotificationUpdateMany(...args),
      count: (...args: unknown[]) => mockNotificationCount(...args),
    },
    attendee: {
      findMany: (...args: unknown[]) => mockAttendeeFindMany(...args),
    },
    event: {
      findMany: (...args: unknown[]) => mockEventFindMany(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// GET /api/notifications
// ---------------------------------------------------------------------------

describe('GET /api/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const { GET } = await import('@/app/api/notifications/route');
    mockGetSession.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 500 on unexpected DB error', async () => {
    const { GET } = await import('@/app/api/notifications/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockNotificationFindMany.mockRejectedValue(new Error('DB down'));

    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });

  it('returns non-invite notifications without enrichment', async () => {
    const { GET } = await import('@/app/api/notifications/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

    mockNotificationFindMany.mockResolvedValue([
      {
        id: 'notif-1',
        userId: 'user-1',
        type: 'JOIN_REQUEST_APPROVED',
        title: 'Request approved',
        body: 'You were approved',
        href: '/app/events/event-1',
        isRead: false,
        createdAt: new Date(),
      },
    ]);
    // No attendee/event lookups needed since there are no EVENT_INVITE notifs

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].type).toBe('JOIN_REQUEST_APPROVED');
    // No attendeeStatus field on non-invite notifications
    expect(body[0].attendeeStatus).toBeUndefined();
  });

  it('handles EVENT_INVITE without href', async () => {
    const { GET } = await import('@/app/api/notifications/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

    mockNotificationFindMany.mockResolvedValue([
      {
        id: 'notif-1',
        userId: 'user-1',
        type: 'EVENT_INVITE',
        title: 'Invited',
        body: 'Come join',
        href: null,
        isRead: false,
        createdAt: new Date(),
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it('handles EVENT_INVITE where attendee has no matching record', async () => {
    const { GET } = await import('@/app/api/notifications/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

    mockNotificationFindMany.mockResolvedValue([
      {
        id: 'notif-1',
        userId: 'user-1',
        type: 'EVENT_INVITE',
        title: 'Invited',
        body: 'Come join',
        href: '/app/events/event-deleted',
        isRead: false,
        createdAt: new Date(),
      },
    ]);
    // Attendee and event records don't exist anymore
    mockAttendeeFindMany.mockResolvedValue([]);
    mockEventFindMany.mockResolvedValue([]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].attendeeStatus).toBeNull();
    expect(body[0].isPast).toBe(false);
  });

  it('returns notifications enriched with attendee status', async () => {
    const { GET } = await import('@/app/api/notifications/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const mockNotifications = [
      {
        id: 'notif-1',
        userId: 'user-1',
        type: 'EVENT_INVITE',
        title: 'You were invited to an event',
        body: 'Alice invited you to "Coffee"',
        href: '/app/events/event-1',
        isRead: false,
        createdAt: new Date(),
      },
      {
        id: 'notif-2',
        userId: 'user-1',
        type: 'JOIN_REQUEST_APPROVED',
        title: 'Join request approved',
        body: 'Your request to join "Party" was approved',
        href: '/app/events/event-2',
        isRead: true,
        createdAt: new Date(),
      },
    ];
    mockNotificationFindMany.mockResolvedValue(mockNotifications);
    mockAttendeeFindMany.mockResolvedValue([
      { eventId: 'event-1', status: 'INVITED' },
    ]);
    mockEventFindMany.mockResolvedValue([{ id: 'event-1', endAt: futureDate }]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].type).toBe('EVENT_INVITE');
    expect(body[0].attendeeStatus).toBe('INVITED');
    expect(body[0].eventId).toBe('event-1');
    expect(body[0].isPast).toBe(false);
    expect(body[1].isRead).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/notifications/unread-count
// ---------------------------------------------------------------------------

describe('GET /api/notifications/unread-count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const { GET } = await import('@/app/api/notifications/unread-count/route');
    mockGetSession.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns unread count for authenticated user', async () => {
    const { GET } = await import('@/app/api/notifications/unread-count/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockNotificationCount.mockResolvedValue(3);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(3);
  });

  it('returns 500 on unexpected DB error', async () => {
    const { GET } = await import('@/app/api/notifications/unread-count/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockNotificationCount.mockRejectedValue(new Error('DB down'));

    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });

  it('returns 0 when no unread notifications', async () => {
    const { GET } = await import('@/app/api/notifications/unread-count/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockNotificationCount.mockResolvedValue(0);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// POST /api/notifications/mark-all-read
// ---------------------------------------------------------------------------

describe('POST /api/notifications/mark-all-read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const { POST } =
      await import('@/app/api/notifications/mark-all-read/route');
    mockGetSession.mockResolvedValue(null);

    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('returns 500 on unexpected DB error', async () => {
    const { POST } =
      await import('@/app/api/notifications/mark-all-read/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockNotificationUpdateMany.mockRejectedValue(new Error('DB down'));

    const res = await POST();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });

  it('marks all unread notifications as read', async () => {
    const { POST } =
      await import('@/app/api/notifications/mark-all-read/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockNotificationUpdateMany.mockResolvedValue({ count: 5 });

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(5);

    // Verify correct Prisma call
    expect(mockNotificationUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRead: false },
      data: { isRead: true },
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/notifications/:id/read
// ---------------------------------------------------------------------------

describe('POST /api/notifications/:id/read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const { POST } = await import('@/app/api/notifications/[id]/read/route');
    mockGetSession.mockResolvedValue(null);

    const req = new Request('http://localhost/api/notifications/notif-1/read', {
      method: 'POST',
    });
    const res = await POST(req as never, {
      params: Promise.resolve({ id: 'notif-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when notification not found', async () => {
    const { POST } = await import('@/app/api/notifications/[id]/read/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockNotificationFindUnique.mockResolvedValue(null);

    const req = new Request('http://localhost/api/notifications/notif-x/read', {
      method: 'POST',
    });
    const res = await POST(req as never, {
      params: Promise.resolve({ id: 'notif-x' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 403 when notification belongs to another user', async () => {
    const { POST } = await import('@/app/api/notifications/[id]/read/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockNotificationFindUnique.mockResolvedValue({
      id: 'notif-1',
      userId: 'user-2',
      isRead: false,
    });

    const req = new Request('http://localhost/api/notifications/notif-1/read', {
      method: 'POST',
    });
    const res = await POST(req as never, {
      params: Promise.resolve({ id: 'notif-1' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 500 on unexpected DB error', async () => {
    const { POST } = await import('@/app/api/notifications/[id]/read/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockNotificationFindUnique.mockRejectedValue(new Error('DB down'));

    const req = new Request('http://localhost/api/notifications/notif-1/read', {
      method: 'POST',
    });
    const res = await POST(req as never, {
      params: Promise.resolve({ id: 'notif-1' }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });

  it('marks notification as read for the owner', async () => {
    const { POST } = await import('@/app/api/notifications/[id]/read/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockNotificationFindUnique.mockResolvedValue({
      id: 'notif-1',
      userId: 'user-1',
      isRead: false,
    });
    mockNotificationUpdate.mockResolvedValue({
      id: 'notif-1',
      userId: 'user-1',
      isRead: true,
    });

    const req = new Request('http://localhost/api/notifications/notif-1/read', {
      method: 'POST',
    });
    const res = await POST(req as never, {
      params: Promise.resolve({ id: 'notif-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isRead).toBe(true);
  });
});
