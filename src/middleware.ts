import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/api/auth',
  '/api/setup',
  '/api/public-scan',
  '/api/face-verify',
  '/api/scan-session',
  '/api/school-config',
  '/api/offline-sync',
  '/api/import-template',
  '/_next',
  '/favicon',
  '/models',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Allow public pages
  if (pathname === '/scan' || pathname.startsWith('/scan/')) {
    return NextResponse.next();
  }

  // Allow root if not authenticated (we handle auth client-side)
  if (pathname === '/') {
    return NextResponse.next();
  }

  // Check for token on protected API routes
  if (pathname.startsWith('/api/')) {
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized - Silakan login terlebih dahulu' }, { status: 401 });
    }
    // Forward token for route handler to verify
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-auth-token', token);
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
