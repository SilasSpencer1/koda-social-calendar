/**
 * Rate limiting utility with Upstash Redis support and fallback to in-memory storage.
 * Production deployments MUST use Upstash Redis.
 */

import type { NextRequest } from 'next/server';

// In-memory store for development (not suitable for production or multi-process environments)
const inMemoryStore = new Map<string, { count: number; resetAt: number }>();

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number; // milliseconds
  keyPrefix?: string;
}

/**
 * Get client identifier from request (IP address or session token)
 */
export function getClientId(req: NextRequest): string {
  // Try to get from x-forwarded-for header (behind proxy)
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  // Fallback to IP from request header or x-real-ip
  const xRealIp = req.headers.get('x-real-ip');
  if (xRealIp) {
    return xRealIp;
  }

  // Last resort: use a default identifier
  return 'unknown';
}

/**
 * Check rate limit using Upstash Redis or fallback to in-memory storage
 * Returns { success: boolean, remaining: number, resetAt: number }
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<{
  success: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}> {
  const key = `${config.keyPrefix || 'rl'}:${identifier}`;
  const now = Date.now();

  // Try Redis if available
  // istanbul ignore if - Redis integration test only
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    try {
      return await checkRateLimitRedis(key, config, now);
    } catch (error) {
      console.error(
        'Redis rate limit check failed, falling back to in-memory:',
        error
      );
      // Fall through to in-memory fallback
    }
  }

  // In-memory fallback
  return checkRateLimitInMemory(key, config, now);
}

/**
 * Check rate limit using Upstash Redis
 * istanbul ignore next - Redis integration test only
 */
async function checkRateLimitRedis(
  key: string,
  config: RateLimitConfig,
  now: number
): Promise<{
  success: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;

  try {
    // Get current count
    const countResponse = await fetch(`${url}/get/${key}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!countResponse.ok) {
      throw new Error(`Redis GET failed: ${countResponse.status}`);
    }

    const countData = (await countResponse.json()) as { result: number | null };
    const count = countData.result || 0;

    if (count >= config.maxRequests) {
      // Get TTL for reset time
      const ttlResponse = await fetch(`${url}/pttl/${key}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const ttlData = (await ttlResponse.json()) as { result: number };
      const ttl = ttlData.result > 0 ? ttlData.result : config.windowMs;
      const resetAt = now + ttl;

      return {
        success: false,
        remaining: 0,
        resetAt,
        limit: config.maxRequests,
      };
    }

    // Increment counter
    const incrResponse = await fetch(`${url}/incr/${key}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!incrResponse.ok) {
      throw new Error(`Redis INCR failed: ${incrResponse.status}`);
    }

    // Set expiration on first request
    if (count === 0) {
      await fetch(`${url}/expire/${key}/${Math.ceil(config.windowMs / 1000)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    }

    const remaining = config.maxRequests - (count + 1);
    const resetAt = now + config.windowMs;

    return {
      success: true,
      remaining,
      resetAt,
      limit: config.maxRequests,
    };
  } catch (error) {
    console.error('Error checking rate limit with Redis:', error);
    throw error;
  }
}

/**
 * Check rate limit using in-memory store (development only)
 */
function checkRateLimitInMemory(
  key: string,
  config: RateLimitConfig,
  now: number
): { success: boolean; remaining: number; resetAt: number; limit: number } {
  let entry = inMemoryStore.get(key);

  // Cleanup expired entries
  if (entry && entry.resetAt < now) {
    inMemoryStore.delete(key);
    entry = undefined;
  }

  // Initialize new entry
  if (!entry) {
    entry = {
      count: 0,
      resetAt: now + config.windowMs,
    };
    inMemoryStore.set(key, entry);
  }

  const isLimited = entry.count >= config.maxRequests;

  if (isLimited) {
    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt,
      limit: config.maxRequests,
    };
  }

  entry.count += 1;
  const remaining = config.maxRequests - entry.count;

  return {
    success: true,
    remaining,
    resetAt: entry.resetAt,
    limit: config.maxRequests,
  };
}

/**
 * Helper to set rate limit headers on a response
 */
export function setRateLimitHeaders(
  response: Response,
  result: { limit: number; remaining: number; resetAt: number }
): Response {
  const newResponse = new Response(response.body, response);
  newResponse.headers.set('X-RateLimit-Limit', result.limit.toString());
  newResponse.headers.set('X-RateLimit-Remaining', result.remaining.toString());
  newResponse.headers.set(
    'X-RateLimit-Reset',
    (result.resetAt / 1000).toFixed(0)
  );
  return newResponse;
}
