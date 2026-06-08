import { randomBytes } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getWorkspaceByClerkOrg } from "@/lib/db/workspace";
import { buildAuthUrl, googleConfigured, redirectUriFor } from "@/lib/integrations/google";

export const runtime = "nodejs";

// Start the Google OAuth flow. Sets an httpOnly cookie carrying the CSRF
// state + the resolved workspace id, then redirects to Google. The callback
// trusts that cookie (set here, after auth) so it doesn't need to re-auth the
// cross-site redirect.
export async function GET(req: Request) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.redirect(new URL("/sign-in", req.url));

  const workspace = await getWorkspaceByClerkOrg(orgId);
  if (!workspace) {
    return NextResponse.json({ error: "workspace_not_found" }, { status: 404 });
  }
  if (!googleConfigured()) {
    return NextResponse.json({ error: "google_not_configured" }, { status: 500 });
  }

  const state = randomBytes(16).toString("hex");
  const authUrl = buildAuthUrl({ redirectUri: redirectUriFor(req), state });

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("g_oauth", `${state}|${workspace.id}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
