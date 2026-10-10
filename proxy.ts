import { NextRequest, NextResponse } from 'next/server';
import { applySecurityHeaders } from '@/lib/http-security';

function protectedResponse(response: NextResponse) {
  applySecurityHeaders(response.headers);
  return response;
}

export function proxy(request: NextRequest) {
  void request;
  return protectedResponse(NextResponse.next());
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
