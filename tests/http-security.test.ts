import { describe, expect, it } from 'vitest';
import { applySecurityHeaders, CONTENT_SECURITY_POLICY } from '@/lib/http-security';

describe('HTTP security policy', () => {
  it('sets the required browser protections without blocking map tiles', () => {
    const headers = applySecurityHeaders(new Headers());
    expect(headers.get('Content-Security-Policy')).toBe(CONTENT_SECURITY_POLICY);
    expect(CONTENT_SECURITY_POLICY).toContain('https://tile.openstreetmap.org');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Permissions-Policy')).toContain('geolocation=(self)');
  });
});
