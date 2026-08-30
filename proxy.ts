import { NextRequest, NextResponse } from 'next/server';
import { applySecurityHeaders } from '@/lib/http-security';
import { createFixedWindowRateLimiter, getClientIdentifier } from '@/lib/rate-limit';

const liveVehicleRateLimiter = createFixedWindowRateLimiter(12, 60_000);

function protectedResponse(response: NextResponse) {
  applySecurityHeaders(response.headers);
  return response;
}

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/api/v1/live-vehicles') {
    const result = liveVehicleRateLimiter.check(getClientIdentifier(request.headers));
    if (!result.allowed) {
      const response = NextResponse.json(
        { error: 'Çok fazla canlı araç isteği gönderildi. Lütfen kısa süre sonra tekrar deneyin.' },
        { status: 429 },
      );
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('Retry-After', String(result.retryAfterSeconds));
      response.headers.set('X-RateLimit-Remaining', '0');
      return protectedResponse(response);
    }

    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Remaining', String(result.remaining));
    return protectedResponse(response);
  }

  return protectedResponse(NextResponse.next());
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
