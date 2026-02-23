import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the Avatar Upload API endpoint.
 *
 * Validates request authentication and file presence.
 * Integration tests with Supabase should be run separately.
 */

const mockGetSession = vi.fn();

vi.mock('@/lib/auth', () => ({
  getSession: () => mockGetSession(),
}));

vi.mock('@/lib/supabase/server', () => ({
  AVATAR_BUCKET: 'avatars',
  createSupabaseServerClient: () => ({
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
  }),
  getPublicUrl: (_bucket: string, path: string) =>
    `https://test.supabase.co/storage/v1/object/public/avatars/${path}`,
}));

describe('Avatar Upload API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Helper to create a mock file
   */
  function createMockFile(
    name: string,
    type: string,
    size: number = 1024
  ): File {
    const buffer = new ArrayBuffer(size);
    return new File([buffer], name, { type });
  }

  describe('Authentication', () => {
    it('returns 401 when no authentication is provided', async () => {
      const { POST } = await import('@/app/api/uploads/avatar/route');

      mockGetSession.mockResolvedValue(null);

      const file = createMockFile('avatar.png', 'image/png');
      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost:3000/api/uploads/avatar', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request as never);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Unauthorized');
    });
  });

  describe('File Validation - Basic Requirements', () => {
    it('returns 400 when no file is provided', async () => {
      const { POST } = await import('@/app/api/uploads/avatar/route');

      mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

      const formData = new FormData();
      const request = new Request('http://localhost:3000/api/uploads/avatar', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request as never);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Missing file');
    });
  });
});
