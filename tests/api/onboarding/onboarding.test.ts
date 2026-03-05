import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetSession = vi.fn();

vi.mock('@/lib/auth', () => ({
  getSession: () => mockGetSession(),
}));

const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// GET /api/me/onboarding
// ---------------------------------------------------------------------------

describe('GET /api/me/onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const { GET } = await import('@/app/api/me/onboarding/route');
    mockGetSession.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns false when user has not completed onboarding', async () => {
    const { GET } = await import('@/app/api/me/onboarding/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockUserFindUnique.mockResolvedValue({ hasCompletedOnboarding: false });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasCompletedOnboarding).toBe(false);
  });

  it('returns true when user has completed onboarding', async () => {
    const { GET } = await import('@/app/api/me/onboarding/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockUserFindUnique.mockResolvedValue({ hasCompletedOnboarding: true });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasCompletedOnboarding).toBe(true);
  });

  it('returns false when user not found in DB', async () => {
    const { GET } = await import('@/app/api/me/onboarding/route');
    mockGetSession.mockResolvedValue({ user: { id: 'missing' } });
    mockUserFindUnique.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasCompletedOnboarding).toBe(false);
  });

  it('returns 500 on unexpected DB error', async () => {
    const { GET } = await import('@/app/api/me/onboarding/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockUserFindUnique.mockRejectedValue(new Error('DB down'));

    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});

// ---------------------------------------------------------------------------
// POST /api/me/onboarding
// ---------------------------------------------------------------------------

describe('POST /api/me/onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const { POST } = await import('@/app/api/me/onboarding/route');
    mockGetSession.mockResolvedValue(null);

    const res = await POST();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('marks onboarding as complete', async () => {
    const { POST } = await import('@/app/api/me/onboarding/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockUserUpdate.mockResolvedValue({ hasCompletedOnboarding: true });

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { hasCompletedOnboarding: true },
    });
  });

  it('returns 500 on unexpected DB error', async () => {
    const { POST } = await import('@/app/api/me/onboarding/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockUserUpdate.mockRejectedValue(new Error('DB down'));

    const res = await POST();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});
