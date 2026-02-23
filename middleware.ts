import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Simple middleware - only checks cookie existence, no crypto usage
// Actual session validation happens in server components
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes - anyone can access
  const publicRoutes = ['/', '/login', '/signup', '/api/auth'];

  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // For protected routes, check for session cookie existence
  // Actual session validation happens in the server components/API routes
  if (pathname.startsWith('/app')) {
    const sessionCookie =
      request.cookies.get('authjs.session-token') ||
      request.cookies.get('__Secure-authjs.session-token');

    if (!sessionCookie) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/auth (NextAuth routes)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/auth).*)',
  ],
};
