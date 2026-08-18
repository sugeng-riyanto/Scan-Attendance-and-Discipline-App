import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseSchoolDomains, normalizeHostname } from '@/lib/school-host';

// Optional hostname routing (per-school subdomains): comma-separated
// "hostname=CODE" entries, e.g. "shb-001.app.test=SHB-001,smpn-01.app.test=SMPN-01".
// When a visitor hits "/" on a school's dedicated subdomain, the request is
// rewritten to that school's landing page (/s/:code) so the subdomain stays
// the canonical URL. Without this env the client-side School.domain resolution
// in the landing page still lands visitors on the right school; on localhost
// the path-based /s/:code is the fallback.
const SCHOOL_DOMAINS = process.env.SCHOOL_DOMAINS || '';
const DOMAIN_TO_CODE = parseSchoolDomains(SCHOOL_DOMAINS);

const PUBLIC_PATHS = [
  '/api/auth',
  '/api/setup',
  '/api/public-scan',
  '/api/face-verify',
  '/api/scan-session',
  '/api/school-config',
  '/api/schools/public',
  '/api/terms-content',  // GET is public so /terms page works without login
  '/api/offline-sync',
  '/api/import-template',
  '/_next',
  '/favicon',
  '/models',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
}

// The hostname a visitor reached us on. Prefer the forwarding/proxy headers,
// then the Host header, then the URL — so hostname routing works both behind
// a reverse proxy and on a direct subdomain.
function requestHost(request: NextRequest): string {
  return request.headers.get('x-forwarded-host')
    || request.headers.get('host')
    || request.nextUrl.hostname;
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

  // Per-school landing pages (/s/:code) are public — each school has its own
  // branded login page at a shareable URL.
  if (pathname === '/s' || pathname.startsWith('/s/')) {
    return NextResponse.next();
  }

  // Per-school subdomain routing: "/" on a school's dedicated hostname serves
  // that school's landing page (rewritten to /s/:code). localhost/unknown
  // hosts keep the shared directory at "/" — path-based /s/:code fallback.
  if (pathname === '/') {
    const host = normalizeHostname(requestHost(request));
    const code = DOMAIN_TO_CODE[host] || DOMAIN_TO_CODE[host.replace(/^www\./, '')];
    if (code) {
      const rewritten = NextResponse.rewrite(new URL(`/s/${code}`, request.url));
      // Debug/observability header — tells you which school the host routed to.
      rewritten.headers.set('x-school-code', code);
      return rewritten;
    }
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
