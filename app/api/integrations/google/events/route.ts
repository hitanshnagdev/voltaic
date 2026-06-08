import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getWorkspaceByClerkOrg } from "@/lib/db/workspace";
import { listCalendarEvents } from "@/lib/integrations/google";
import { getValidAccessToken } from "@/lib/integrations/google-store";

export const runtime = "nodejs";

// Upcoming calendar events for the connected Google account.
export async function GET() {
  const { orgId } = await auth();
  if (!orgId) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }
  const workspace = await getWorkspaceByClerkOrg(orgId);
  if (!workspace) return NextResponse.json({ connected: false, events: [] });

  const token = await getValidAccessToken(workspace.id);
  if (!token) return NextResponse.json({ connected: false, events: [] });

  try {
    const events = await listCalendarEvents({
      accessToken: token,
      timeMinIso: new Date().toISOString(),
      maxResults: 8,
    });
    return NextResponse.json({ connected: true, events });
  } catch (e) {
    console.error("google_events_failed", e);
    return NextResponse.json({ connected: true, events: [], error: "fetch_failed" });
  }
}
