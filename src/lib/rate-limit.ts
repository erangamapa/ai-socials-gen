interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory sliding-window rate limiter for serverless/edge.
 * Not shared across instances — use Redis for distributed rate limiting.
 */
export function createRateLimiter(opts: { windowMs: number; max: number }) {
  const store = new Map<string, RateLimitEntry>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, 60_000);

  return {
    check(key: string): { ok: boolean; remaining: number; resetAt: number } {
      const now = Date.now();
      const entry = store.get(key);

      if (!entry || entry.resetAt <= now) {
        store.set(key, { count: 1, resetAt: now + opts.windowMs });
        return { ok: true, remaining: opts.max - 1, resetAt: now + opts.windowMs };
      }

      entry.count++;
      const remaining = Math.max(0, opts.max - entry.count);
      return { ok: entry.count <= opts.max, remaining, resetAt: entry.resetAt };
    },
  };
}

export const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
export const aiLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 20 });
export const jobLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 10 });
