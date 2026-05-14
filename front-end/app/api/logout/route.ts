import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const BACKEND_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function POST() {
  // Best-effort: notify backend so it invalidates its own state (and sends
  // its own clear-cookie headers).
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');

    await fetch(`${BACKEND_URL}/auth/logout`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
  } catch {
    // ignore — frontend will still clear the cookie below
  }

  const res = NextResponse.json({ ok: true });
  // Clear from the Next.js origin too — both host-only and any legacy
  // Domain=localhost variant that might still be lingering.
  res.cookies.set('session', '', { path: '/', maxAge: 0 });
  res.cookies.set('session', '', { path: '/', maxAge: 0, domain: 'localhost' });
  return res;
}
