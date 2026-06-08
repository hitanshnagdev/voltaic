import "server-only";

/**
 * Google OAuth + Calendar — thin fetch-based client (no googleapis dep).
 *
 * Scopes: openid + email (to identify the connecting account) and
 * calendar.readonly (least-privilege — we only read meetings; we never
 * write to the user's calendar). The consent screen also lists
 * calendar.events, but we deliberately don't request it.
 *
 * Meet transcripts are NOT fetched here — native Meet transcripts require
 * the host to enable transcription per call (rejected). This integration
 * detects meetings; transcripts come from manual paste (and, later, a
 * first-party bot).
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const CALENDAR_EVENTS =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.readonly",
];

function clientId(): string {
  const v = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!v) throw new Error("GOOGLE_OAUTH_CLIENT_ID not set");
  return v;
}
function clientSecret(): string {
  const v = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!v) throw new Error("GOOGLE_OAUTH_CLIENT_SECRET not set");
  return v;
}

export function googleConfigured(): boolean {
  return (
    !!process.env.GOOGLE_OAUTH_CLIENT_ID &&
    !!process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );
}

/** Same redirect URI must be used in /connect and /callback. */
export function redirectUriFor(req: Request): string {
  if (process.env.GOOGLE_OAUTH_REDIRECT_URI) {
    return process.env.GOOGLE_OAUTH_REDIRECT_URI;
  }
  return `${new URL(req.url).origin}/api/integrations/google/callback`;
}

export function buildAuthUrl(args: { redirectUri: string; state: string }): string {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: args.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state: args.state,
  });
  return `${AUTH_ENDPOINT}?${p.toString()}`;
}

export type GoogleTokens = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
};

export async function exchangeCode(args: {
  code: string;
  redirectUri: string;
}): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: args.code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: args.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`google_token_exchange_failed:${res.status}:${await res.text()}`);
  }
  return (await res.json()) as GoogleTokens;
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`google_token_refresh_failed:${res.status}`);
  return (await res.json()) as GoogleTokens;
}

export async function fetchUserInfo(
  accessToken: string,
): Promise<{ sub: string; email: string | null }> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`google_userinfo_failed:${res.status}`);
  const j = (await res.json()) as { sub: string; email?: string };
  return { sub: j.sub, email: j.email ?? null };
}

export type CalendarEvent = {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  attendees: string[];
  hangoutLink: string | null;
};

type RawEvent = {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string }>;
  hangoutLink?: string;
};

export async function listCalendarEvents(args: {
  accessToken: string;
  timeMinIso: string;
  maxResults?: number;
}): Promise<CalendarEvent[]> {
  const p = new URLSearchParams({
    timeMin: args.timeMinIso,
    maxResults: String(args.maxResults ?? 10),
    singleEvents: "true",
    orderBy: "startTime",
  });
  const res = await fetch(`${CALENDAR_EVENTS}?${p.toString()}`, {
    headers: { authorization: `Bearer ${args.accessToken}` },
  });
  if (!res.ok) throw new Error(`google_calendar_failed:${res.status}`);
  const j = (await res.json()) as { items?: RawEvent[] };
  return (j.items ?? []).map((e) => ({
    id: String(e.id ?? ""),
    title: e.summary ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date ?? null,
    end: e.end?.dateTime ?? e.end?.date ?? null,
    attendees: (e.attendees ?? [])
      .map((a) => a.email)
      .filter((x): x is string => !!x),
    hangoutLink: e.hangoutLink ?? null,
  }));
}
