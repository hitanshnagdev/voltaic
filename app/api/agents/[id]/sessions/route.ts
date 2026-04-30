import { NextResponse } from "next/server";
import { resolveAuthedContext } from "@/lib/agents/auth-helper";
import {
  createSession,
  getAgent,
  listSessions,
} from "@/lib/db/agents";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await resolveAuthedContext();
  if (!ctx) {
    return NextResponse.json({ sessions: [] });
  }
  const sessions = await listSessions({
    workspaceId: ctx.workspaceId,
    agentId: id,
    projectId: ctx.projectId,
  });
  return NextResponse.json({ sessions });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await resolveAuthedContext();
  if (!ctx) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }
  const agent = await getAgent(ctx.workspaceId, id);
  if (!agent) {
    return NextResponse.json({ error: "agent_not_found" }, { status: 404 });
  }

  // Optional pair scope (whole-project default). Body is permissive
  // — empty / no-body POST keeps the prior behavior. Both ids must
  // be set together for scope to apply.
  let scopedSubmittalId: string | null = null;
  let scopedSpecId: string | null = null;
  try {
    const body = await req.json().catch(() => null);
    if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      if (
        typeof b.scopedSubmittalId === "string" &&
        typeof b.scopedSpecId === "string"
      ) {
        scopedSubmittalId = b.scopedSubmittalId;
        scopedSpecId = b.scopedSpecId;
      }
    }
  } catch {
    // tolerate missing body
  }

  const session = await createSession({
    workspaceId: ctx.workspaceId,
    projectId: ctx.projectId,
    agentId: id,
    title: null,
    scopedSubmittalId,
    scopedSpecId,
  });
  return NextResponse.json({
    session: {
      id: session.id,
      agentId: session.agentId,
      projectId: session.projectId,
      title: session.title,
      scopedSubmittalId: session.scopedSubmittalId,
      scopedSpecId: session.scopedSpecId,
      createdAt: session.createdAt.toISOString(),
      lastMessageAt: session.lastMessageAt.toISOString(),
      messageCount: 0,
    },
  });
}
