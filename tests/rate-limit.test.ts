import { describe, expect, it } from 'vitest';
import { createFixedWindowRateLimiter, getClientIdentifier } from '@/lib/rate-limit';

describe('live API rate limiter', () => {
  it('limits a client and opens a new fixed window', () => {
    const limiter = createFixedWindowRateLimiter(2, 60_000);
    expect(limiter.check('client', 1_000)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check('client', 1_001)).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.check('client', 1_002)).toMatchObject({ allowed: false, remaining: 0 });
    expect(limiter.check('client', 61_001)).toMatchObject({ allowed: true, remaining: 1 });
  });

  it('prefers Cloudflare client addresses and rejects untrusted values', () => {
    expect(getClientIdentifier(new Headers({ 'cf-connecting-ip': '203.0.113.5', 'x-forwarded-for': '198.51.100.2' }))).toBe('203.0.113.5');
    expect(getClientIdentifier(new Headers({ 'x-forwarded-for': '198.51.100.2, 10.0.0.1' }))).toBe('198.51.100.2');
    expect(getClientIdentifier(new Headers({ 'x-forwarded-for': 'not-an-ip' }))).toBe('anonymous');
  });
});
