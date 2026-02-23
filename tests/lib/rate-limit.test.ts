/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit, getClientId } from '@/lib/rate-limit';
import type { NextRequest } from 'next/server';

// Mock NextRequest
const createMockRequest = (
  headers: Record<string, string> = {}
): NextRequest => {
  const url = new URL('http://localhost:3000/api/test');
  return {
    headers: new Headers(headers),
    url: url.toString(),
  } as any;
};

describe('Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure Redis env vars are not set during tests
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  describe('getClientId', () => {
    it('should extract client ID from x-forwarded-for header', () => {
      const req = createMockRequest({
        'x-forwarded-for': '10.0.0.1, 10.0.0.2',
      });

      const clientId = getClientId(req);
      expect(clientId).toBe('10.0.0.1');
    });

    it('should fall back to x-real-ip header', () => {
      const req = createMockRequest({
        'x-real-ip': '10.0.0.3',
      });

      const clientId = getClientId(req);
      expect(clientId).toBe('10.0.0.3');
    });

    it('should handle missing IP gracefully', () => {
      const req = createMockRequest();
      const clientId = getClientId(req);
      expect(clientId).toBe('unknown');
    });

    it('should trim whitespace from x-forwarded-for', () => {
      const req = createMockRequest({
        'x-forwarded-for': '  192.168.1.100  ,  10.0.0.1',
      });

      const clientId = getClientId(req);
      expect(clientId).toBe('192.168.1.100');
    });

    it('should handle multiple forwarded IPs', () => {
      const req = createMockRequest({
        'x-forwarded-for': '203.0.113.1, 198.51.100.1, 192.0.2.1',
      });

      const clientId = getClientId(req);
      expect(clientId).toBe('203.0.113.1');
    });

    it('should prioritize x-forwarded-for over x-real-ip', () => {
      const req = createMockRequest({
        'x-forwarded-for': '10.0.0.5',
        'x-real-ip': '10.0.0.3',
      });

      const clientId = getClientId(req);
      expect(clientId).toBe('10.0.0.5');
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests under the limit', async () => {
      const result = await checkRateLimit('unique-test-user-1', {
        maxRequests: 5,
        windowMs: 60000,
        keyPrefix: 'test-rl-1',
      });

      expect(result.success).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
      expect(result.limit).toBe(5);
    });

    it('should reject requests over the limit', async () => {
      const config = {
        maxRequests: 1,
        windowMs: 60000,
        keyPrefix: 'test-rl-2',
      };

      const result1 = await checkRateLimit('test-limit-user', config);
      expect(result1.success).toBe(true);

      const result2 = await checkRateLimit('test-limit-user', config);
      expect(result2.success).toBe(false);
      expect(result2.remaining).toBe(0);
    });

    it('should isolate rate limits per key prefix', async () => {
      const config1 = {
        maxRequests: 1,
        windowMs: 60000,
        keyPrefix: 'rl-a',
      };

      const config2 = {
        maxRequests: 1,
        windowMs: 60000,
        keyPrefix: 'rl-b',
      };

      const result1 = await checkRateLimit('same-user', config1);
      expect(result1.success).toBe(true);

      const result2 = await checkRateLimit('same-user', config1);
      expect(result2.success).toBe(false);

      // Different prefix should still allow
      const result3 = await checkRateLimit('same-user', config2);
      expect(result3.success).toBe(true);
    });

    it('should isolate rate limits per identifier', async () => {
      const config = {
        maxRequests: 1,
        windowMs: 60000,
        keyPrefix: 'rl-iso',
      };

      const result1 = await checkRateLimit('user-a', config);
      expect(result1.success).toBe(true);

      const result2 = await checkRateLimit('user-b', config);
      expect(result2.success).toBe(true);
    });

    it('should include valid reset time', async () => {
      const result = await checkRateLimit('test-reset-time', {
        maxRequests: 10,
        windowMs: 5000,
        keyPrefix: 'test-reset',
      });

      expect(typeof result.resetAt).toBe('number');
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });

    it('should provide rate limit metadata', async () => {
      const result = await checkRateLimit('metadata-test', {
        maxRequests: 3,
        windowMs: 10000,
        keyPrefix: 'metadata',
      });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('remaining');
      expect(result).toHaveProperty('resetAt');
      expect(result).toHaveProperty('limit');
      expect(result.limit).toBe(3);
    });

    it('should decrement remaining count with each request', async () => {
      const config = {
        maxRequests: 3,
        windowMs: 60000,
        keyPrefix: 'decrement-test',
      };

      const result1 = await checkRateLimit('decr-user', config);
      expect(result1.remaining).toBe(2);

      const result2 = await checkRateLimit('decr-user', config);
      expect(result2.remaining).toBe(1);

      const result3 = await checkRateLimit('decr-user', config);
      expect(result3.remaining).toBe(0);
    });

    it('should handle default keyPrefix', async () => {
      const result = await checkRateLimit('default-prefix-user', {
        maxRequests: 5,
        windowMs: 10000,
        // keyPrefix not specified, should use 'rl' as default
      });

      expect(result.limit).toBe(5);
      expect(result.success).toBe(true);
    });
  });

  describe('Rate Limit Header Helper', () => {
    it('should correctly format rate limit metadata', async () => {
      const result = await checkRateLimit('header-test', {
        maxRequests: 10,
        windowMs: 60000,
        keyPrefix: 'header',
      });

      expect(result.limit).toBe(10);
      expect(result.remaining).toBeLessThanOrEqual(10);
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });
  });
});
