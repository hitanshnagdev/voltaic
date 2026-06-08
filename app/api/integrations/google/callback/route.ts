import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  exchangeCode,
  fetchUserInfo,
  GOOGLE_SCOPES,
  redirectUriFor,
} from "@/lib/integrations/google";
import { upsertGoogleIntegration } from "@/lib/integrations/google-store";

export const runtime = "nodejs";

// Google redirects here with ?code & ?state. This route is public (the
// redirect is cross-site), so it authorizes via the httpOnly `g_oauth`
// cookie set by /connect — which encodes both the CSRF state and the
// workspace id, and was written only after a signed-in user started the flow.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const back = new URL("/sources", req.url);

  if (url.searchParams.get("error")) {
    back.searchParams.set("google", "denied");
    return NextResponse.redirect(back);
  }
  if (!code || !state) {
    back.searchParams.set("google", "error");
    return NextResponse.redirect(back);
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get("g_oauth")?.value;
  const [cookieState, workspaceId] = (raw ?? "").split("|");
  if (!cookieState || cookieState !== state || !workspaceId) {
    back.searchParams.set("google", "state_mismatch");
    return NextResponse.redirect(back);
  }

  try {
    const tokens = await exchangeCode({ code, redirectUri: redirectUriFor(req) });
    const info = await fetchUserInfo(tokens.access_token);
    await upsertGoogleIntegration({
      workspaceId,
      externalUserId: info.sub,
      email: info.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
      scopes: tokens.scope ? tokens.scope.split(" ") : GOOGLE_SCOPES,
    });
    back.searchParams.set("google", "connected");
  } catch (e) {
    console.error("google_oauth_callback_failed", e);
    back.searchParams.set("google", "error");
  }

  const res = NextResponse.redirect(back);
  res.cookies.delete("g_oauth");
  return res;
}
