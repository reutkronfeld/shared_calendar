// Client-side fetch wrapper that always sends cookies.
// API base URL is exposed as NEXT_PUBLIC_API_URL so it can be used from "use client" components.

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type ApiError = {
  status: number;
  body: unknown;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> ?? {}) };
  if (init?.body !== undefined && headers['Content-Type'] === undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers,
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
  completeOnboarding: () => request<{ ok: true }>('/me/complete-onboarding', { method: 'POST' }),
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
  findSlots: (groupId: string, body: FindSlotsRequest) =>
    request<FindSlotsResponse>(`/groups/${groupId}/find-slots`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateConstraints: (groupId: string, body: Partial<GroupConstraints>) =>
    request<GroupConstraints>(`/groups/${groupId}/constraints`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  rotateGroupCode: (groupId: string) =>
    request<{ id: string; code: string; name: string }>(`/groups/${groupId}/rotate-code`, {
      method: 'POST',
    }),
  deleteGroup: (groupId: string) =>
    request<void>(`/groups/${groupId}`, { method: 'DELETE' }),
  listOverrides: () => request<AvailabilityOverride[]>('/me/overrides'),
  createOverride: (body: { start: string; end: string; type: 'busy' | 'free'; note?: string }) =>
    request<AvailabilityOverride>('/me/overrides', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteOverride: (id: string) =>
    request<void>(`/me/overrides/${id}`, { method: 'DELETE' }),
  getWeeklyAvailability: () =>
    request<{ daysAvailability: WeeklyDayAvailability[] }>('/me/weekly-availability'),
  updateWeeklyAvailability: (daysAvailability: WeeklyDayAvailability[]) =>
    request<{ daysAvailability: WeeklyDayAvailability[] }>('/me/weekly-availability', {
      method: 'PUT',
      body: JSON.stringify({ daysAvailability }),
    }),
};

export interface WeeklyTimeRange {
  startMinute: number;
  endMinute: number;
}

export interface WeeklyDayAvailability {
  day: number;
  enabled: boolean;
  timeRanges: WeeklyTimeRange[];
}

export interface AvailabilityOverride {
  id: string;
  start: string;
  end: string;
  type: 'busy' | 'free';
  note: string | null;
}

export interface GroupConstraints {
  excludedWeekdays: number[];
  /** Minute of day (0-1439). */
  noEarlierThan: number;
  /** Minute of day (1-1440, exclusive). */
  noLaterThan: number;
  lunchBreak: { enabled: boolean; startMinute: number; endMinute: number };
  bufferMinutes: number;
  minNoticeHours: number;
  excludedDates: string[];
}

export interface FindSlotsRequest {
  rangeStart: string;
  rangeEnd: string;
  durationMinutes: number;
  timezone: string;
  meetingLocation?: string;
}

export interface MovableBlocker {
  memberId: string;
  memberName: string;
  eventId: string;
  summary: string;
  start: string;
  end: string;
}

export interface NearMissSuggestion {
  slotStart: string;
  slotEnd: string;
  movableBlockers: MovableBlocker[];
}

export interface FindSlotsResponse {
  slots: Array<{ start: string; end: string }>;
  nearMisses: NearMissSuggestion[];
  missingAvailability: Array<{ userId: string; name: string }>;
  memberCount: number;
  meetingLocationResolved: boolean;
}

export interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string;
    picture: string | null;
    defaultTimeZone: string;
    hasGoogleSync: boolean;
    hasWeeklyAvailability: boolean;
    onboarded: boolean;
  };
  memberships: Array<{
    groupId: string;
    code: string;
    name: string;
    role: 'organizer' | 'member';
    joinedAt: string;
  }>;
}
