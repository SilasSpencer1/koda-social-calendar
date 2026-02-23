/**
 * External API response caching.
 * Uses Upstash Redis when configured, falls back to in-memory Map for dev.
 */

const inMemoryCache = new Map<string, { value: string; expiresAt: number }>();

/**
 * Safely parse JSON, returning null on failure.
 */
function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Safely stringify a value, returning null on failure (e.g. circular refs).
 */
function safeJsonStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/**
 * Get a cached value by key.
 * Returns parsed JSON or null if miss / expired.
 */
export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    try {
      const res = await fetch(
        `${process.env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          },
        }
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { result: string | null };
      if (!data.result) return null;
      return safeJsonParse<T>(data.result);
    } catch {
      // Fall through to in-memory
    }
  }

  // In-memory fallback
  const entry = inMemoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    inMemoryCache.delete(key);
    return null;
  }
  return safeJsonParse<T>(entry.value);
}

/**
 * Set a cached value with TTL in seconds.
 */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  const serialized = safeJsonStringify(value);
  if (!serialized) return; // skip caching non-serializable values

  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    try {
      // Use POST with JSON body to avoid URL length limits for large payloads
      const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['SET', key, serialized, 'EX', ttlSeconds]),
      });
      if (res.ok) return;
      // Non-ok response — fall through to in-memory
      console.warn(`[Cache] Redis SET failed: ${res.status}`);
    } catch {
      // Fall through to in-memory
    }
  }

  // In-memory fallback
  inMemoryCache.set(key, {
    value: serialized,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}
