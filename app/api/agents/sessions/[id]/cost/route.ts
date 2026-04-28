import { NextResponse } from "next/server";
import { resolveAuthedContext } from "@/lib/agents/auth-helper";
import { getSessionCost } from "@/lib/db/agents";

export const runtime = "nodejs";

/**
 * Per-session cost meter. Sums llm_calls rows tagged with
 * `meta.sessionId = <session>`. Hot during the chat (polled after each
 * turn) so the user sees what the conversation has cost so far —
 * non-trivial given the $10 Anthropic budget at this stage.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await resolveAuthedContext();
  if (!ctx) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }
  const cost = await getSessionCost(ctx.workspaceId, id);
  return NextResponse.json({ cost });
}
