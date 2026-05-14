import { google } from 'googleapis';
import { env } from '../../config/env.js';
import { decrypt } from '../../lib/crypto.js';
import type { RefreshTokenEnc } from '../users/user.model.js';

export interface BusyInterval {
  start: Date;
  end: Date;
}

/**
 * Query a user's Google Calendar free/busy for [timeMin, timeMax) using
 * their stored refresh token. Returns busy intervals in chronological order.
 *
 * Throws if no refresh token exists. Callers should treat the member as
 * "unknown availability" and decide how to surface that.
 */
export async function fetchBusyForUser(
  refreshTokenEnc: RefreshTokenEnc,
  timeMin: Date,
  timeMax: Date,
): Promise<BusyInterval[]> {
  const refreshToken = decrypt(refreshTokenEnc);

  const oauth2 = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
  oauth2.setCredentials({ refresh_token: refreshToken });

  const calendar = google.calendar({ version: 'v3', auth: oauth2 });
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: 'primary' }],
    },
  });

  const busy = res.data.calendars?.primary?.busy ?? [];
  return busy
    .map((b) => ({ start: new Date(b.start!), end: new Date(b.end!) }))
    .filter((b) => !isNaN(b.start.getTime()) && !isNaN(b.end.getTime()));
}
