type RateLimitEntry = { count: number; resetAt: number };

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function createFixedWindowRateLimiter(limit: number, windowMs: number, maxEntries = 10_000) {
  const entries = new Map<string, RateLimitEntry>();

  function prune(now: number) {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) entries.delete(key);
    }
    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value;
      if (!oldestKey) break;
      entries.delete(oldestKey);
    }
  }

  return {
    check(key: string, now = Date.now()): RateLimitResult {
      prune(now);
      const entry = entries.get(key);
      if (!entry || entry.resetAt <= now) {
        entries.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds: Math.ceil(windowMs / 1_000) };
      }

      entry.count += 1;
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1_000));
      return {
        allowed: entry.count <= limit,
        remaining: Math.max(0, limit - entry.count),
        retryAfterSeconds,
      };
    },
  };
}

function validIp(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f:.]{3,64}$/iu.test(value));
}

/** Cloudflare supplies CF-Connecting-IP. The development fallback is intentionally conservative. */
export function getClientIdentifier(headers: Headers) {
  const cloudflareIp = headers.get('cf-connecting-ip')?.trim() ?? null;
  if (validIp(cloudflareIp)) return cloudflareIp;

  const forwardedIp = headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  return validIp(forwardedIp) ? forwardedIp : 'anonymous';
}
