import { NextResponse } from "next/server";
import { resolveAuthedContext } from "@/lib/agents/auth-helper";
import { listPairsForProject } from "@/lib/db/assignments";

export const runtime = "nodejs";

/**
 * GET /api/pairs
 *
 * Flat list of (submittal × spec × csi) assignments in the active
 * project. Powers the agents-page "Ask about a pair" selector — when
 * the user picks one, a new chat session is created with that pair as
 * its scope and retrieval restricts to those two documents.
 */
export async function GET() {
  const ctx = await resolveAuthedContext();
  if (!ctx) {
    return NextResponse.json({ pairs: [] });
  }
  const pairs = await listPairsForProject({
    workspaceId: ctx.workspaceId,
    projectId: ctx.projectId,
  });
  return NextResponse.json({ pairs });
}
