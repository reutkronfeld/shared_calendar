import { google } from 'googleapis';
import { env } from '../../config/env.js';
import { decrypt } from '../../lib/crypto.js';
import type { RefreshTokenEnc } from '../users/user.model.js';

export interface CalEvent {
  id: string;
  start: Date;
  end: Date;
  summary: string;
  location: string | null;
}

/**
 * Fetch a user's Google Calendar events in [timeMin, timeMax). Unlike freebusy,
 * this returns summary+location so we can classify importance and reason about
 * travel between meetings.
 *
 * Filters out all-day events (no time) and cancelled events.
 */
export async function fetchEventsForUser(
  refreshTokenEnc: RefreshTokenEnc,
  timeMin: Date,
  timeMax: Date,
): Promise<CalEvent[]> {
  const refreshToken = decrypt(refreshTokenEnc);

  const oauth2 = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
  oauth2.setCredentials({ refresh_token: refreshToken });

  const calendar = google.calendar({ version: 'v3', auth: oauth2 });
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  });

  const items = res.data.items ?? [];
  const out: CalEvent[] = [];
  for (const it of items) {
    if (it.status === 'cancelled') continue;
    const startStr = it.start?.dateTime;
    const endStr = it.end?.dateTime;
    if (!startStr || !endStr) continue;
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;
    out.push({
      id: it.id ?? `${start.toISOString()}`,
      start,
      end,
      summary: (it.summary ?? '').trim(),
      location: it.location?.trim() || null,
    });
  }
  return out;
}
