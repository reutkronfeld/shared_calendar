// Server-only helper. Calls the API with the user's cookie forwarded.
// Used from server components / route handlers.
//
// NOTE: Next.js 16 — `cookies()` is async, must be awaited.

import { cookies } from 'next/headers';
import type { MeResponse } from './api';

const SERVER_API = process.env.API_URL ?? 'http://localhost:4000';

export async function getMe(): Promise<MeResponse | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  try {
    const res = await fetch(`${SERVER_API}/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    return (await res.json()) as MeResponse;
  } catch {
    // Network error (backend down, DNS, etc.) — render pages as logged-out
    // rather than 500-ing the entire layout.
    return null;
  }
}
