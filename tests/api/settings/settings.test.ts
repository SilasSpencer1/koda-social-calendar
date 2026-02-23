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
const mockSettingsFindUnique = vi.fn();
const mockSettingsUpsert = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
    settings: {
      findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args),
      upsert: (...args: unknown[]) => mockSettingsUpsert(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// GET /api/me
// ---------------------------------------------------------------------------

describe('GET /api/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const { GET } = await import('@/app/api/me/route');
    mockGetSession.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 404 when user row is missing', async () => {
    const { GET } = await import('@/app/api/me/route');
    mockGetSession.mockResolvedValue({ user: { id: 'ghost-user' } });
    mockUserFindUnique.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('User not found');
  });

  it('returns user with null settings when no settings row exists', async () => {
    const { GET } = await import('@/app/api/me/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockUserFindUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      name: 'A',
      username: null,
      avatarUrl: null,
      city: null,
      createdAt: new Date(),
    });
    mockSettingsFindUnique.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe('user-1');
    expect(body.settings).toBeNull();
  });

  it('returns user + settings when both exist', async () => {
    const { GET } = await import('@/app/api/me/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockUserFindUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@test.com',
      name: 'Test User',
      username: 'testuser',
      avatarUrl: null,
      city: 'SF',
      createdAt: new Date(),
    });
    mockSettingsFindUnique.mockResolvedValue({
      accountVisibility: 'PRIVATE',
      defaultDetailLevel: 'DETAILS',
      allowSuggestions: false,
      emailInvitesEnabled: true,
      emailDigestEnabled: false,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.name).toBe('Test User');
    expect(body.settings.accountVisibility).toBe('PRIVATE');
    expect(body.settings.emailInvitesEnabled).toBe(true);
  });

  it('returns 500 on unexpected error', async () => {
    const { GET } = await import('@/app/api/me/route');
    mockGetSession.mockRejectedValue(new Error('db down'));

    const res = await GET();
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/me/profile
// ---------------------------------------------------------------------------

describe('PATCH /api/me/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects duplicate username with 409', async () => {
    const { PATCH } = await import('@/app/api/me/profile/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockUserFindUnique.mockResolvedValue({
      id: 'user-2',
      username: 'taken_name',
    });

    const req = new Request('http://localhost/api/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test User', username: 'taken_name' }),
    });

    const res = await PATCH(req as never);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('already taken');
    expect(body.field).toBe('username');
  });

  it('allows user to keep their own username', async () => {
    const { PATCH } = await import('@/app/api/me/profile/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockUserFindUnique.mockResolvedValue({
      id: 'user-1',
      username: 'my_name',
    });
    mockUserUpdate.mockResolvedValue({
      id: 'user-1',
      email: 'test@test.com',
      name: 'Updated Name',
      username: 'my_name',
      avatarUrl: null,
      city: null,
    });

    const req = new Request('http://localhost/api/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Name', username: 'my_name' }),
    });

    const res = await PATCH(req as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Updated Name');
  });

  it('updates city field when provided', async () => {
    const { PATCH } = await import('@/app/api/me/profile/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockUserUpdate.mockResolvedValue({
      id: 'user-1',
      email: 'test@test.com',
      name: 'Updated Name',
      username: null,
      avatarUrl: null,
      city: 'New York',
    });

    const req = new Request('http://localhost/api/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Name', city: 'New York' }),
    });

    const res = await PATCH(req as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.city).toBe('New York');
  });

  it('requires authentication', async () => {
    const { PATCH } = await import('@/app/api/me/profile/route');
    mockGetSession.mockResolvedValue(null);

    const req = new Request('http://localhost/api/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' }),
    });

    const res = await PATCH(req as never);
    expect(res.status).toBe(401);
  });

  it('validates input with Zod (empty name)', async () => {
    const { PATCH } = await import('@/app/api/me/profile/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

    const req = new Request('http://localhost/api/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });

    const res = await PATCH(req as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 on malformed JSON', async () => {
    const { PATCH } = await import('@/app/api/me/profile/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

    const req = new Request('http://localhost/api/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json',
    });

    const res = await PATCH(req as never);
    expect(res.status).toBe(400);
  });

  it('returns 500 on unexpected DB error', async () => {
    const { PATCH } = await import('@/app/api/me/profile/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    // No username to check, skip straight to update which throws
    mockUserUpdate.mockRejectedValue(new Error('DB unreachable'));

    const req = new Request('http://localhost/api/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Valid Name' }),
    });

    const res = await PATCH(req as never);
    expect(res.status).toBe(500);
  });

  it('skips username check when username is not provided', async () => {
    const { PATCH } = await import('@/app/api/me/profile/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockUserUpdate.mockResolvedValue({
      id: 'user-1',
      email: 'test@test.com',
      name: 'Name Only',
      username: null,
      avatarUrl: null,
      city: null,
    });

    const req = new Request('http://localhost/api/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Name Only' }),
    });

    const res = await PATCH(req as never);
    expect(res.status).toBe(200);
    // findUnique should NOT have been called since no username was provided
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/me/privacy
// ---------------------------------------------------------------------------

describe('PATCH /api/me/privacy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication', async () => {
    const { PATCH } = await import('@/app/api/me/privacy/route');
    mockGetSession.mockResolvedValue(null);

    const req = new Request('http://localhost/api/me/privacy', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountVisibility: 'PUBLIC',
        defaultDetailLevel: 'DETAILS',
        allowSuggestions: true,
      }),
    });

    const res = await PATCH(req as never);
    expect(res.status).toBe(401);
  });

  it('persists privacy changes', async () => {
    const { PATCH } = await import('@/app/api/me/privacy/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

    const payload = {
      accountVisibility: 'PRIVATE' as const,
      defaultDetailLevel: 'DETAILS' as const,
      allowSuggestions: false,
    };
    mockSettingsUpsert.mockResolvedValue(payload);

    const req = new Request('http://localhost/api/me/privacy', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const res = await PATCH(req as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accountVisibility).toBe('PRIVATE');
    expect(body.allowSuggestions).toBe(false);
  });

  it('returns 400 for invalid Zod data', async () => {
    const { PATCH } = await import('@/app/api/me/privacy/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

    const req = new Request('http://localhost/api/me/privacy', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountVisibility: 'INVALID_ENUM' }),
    });

    const res = await PATCH(req as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 on malformed JSON', async () => {
    const { PATCH } = await import('@/app/api/me/privacy/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

    const req = new Request('http://localhost/api/me/privacy', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{{broken',
    });

    const res = await PATCH(req as never);
    expect(res.status).toBe(400);
  });

  it('returns 500 on unexpected error', async () => {
    const { PATCH } = await import('@/app/api/me/privacy/route');
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockSettingsUpsert.mockRejectedValue(new Error('DB down'));

    const req = new Request('http://localhost/api/me/privacy', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountVisibility: 'PUBLIC',
        defaultDetailLevel: 'DETAILS',
        allowSuggestions: true,
      }),
    });

    const res = await PATCH(req as never);
    expect(res.status).toBe(500);
  });
});
