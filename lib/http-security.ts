/** Response headers that are safe for the map application and its public API. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "connect-src 'self' https://tile.openstreetmap.org",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
].join('; ');

export function applySecurityHeaders(headers: Headers) {
  headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), payment=(), geolocation=(self)');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  return headers;
}
