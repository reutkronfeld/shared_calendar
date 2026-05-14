import { NextResponse, type NextRequest } from 'next/server';

// Routes that require an authenticated session cookie.
// We don't validate the JWT here — only check presence — to keep the
// middleware fast. Real verification happens at the API.
const PROTECTED_PREFIXES = ['/groups'];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const protectedRoute = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!protectedRoute) return NextResponse.next();

  const session = req.cookies.get('session')?.value;
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = '/signin';
    url.search = '';
    url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/groups/:path*'],
};
