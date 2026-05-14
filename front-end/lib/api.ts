// Client-side fetch wrapper that always sends cookies.
// API base URL is exposed as NEXT_PUBLIC_API_URL so it can be used from "use client" components.

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type ApiError = {
  status: number;
  body: unknown;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // ignore
    }
    const err: ApiError = { status: res.status, body };
    throw err;
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  signinUrl: () => `${BASE}/auth/google`,
  me: () => request<MeResponse>('/me'),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  createGroup: (name: string) =>
    request<{ id: string; code: string; name: string }>('/groups', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  joinGroup: (code: string) =>
    request<{ id: string; code: string; name: string; alreadyMember?: boolean }>(
      '/groups/join',
      { method: 'POST', body: JSON.stringify({ code }) },
    ),
};

export interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string;
    picture: string | null;
    defaultTimeZone: string;
  };
  memberships: Array<{
    groupId: string;
    code: string;
    name: string;
    role: 'organizer' | 'member';
    joinedAt: string;
  }>;
}
