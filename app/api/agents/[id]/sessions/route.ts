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
  _req: Request,
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
  const session = await createSession({
    workspaceId: ctx.workspaceId,
    projectId: ctx.projectId,
    agentId: id,
    title: null,
  });
  return NextResponse.json({
    session: {
      id: session.id,
      agentId: session.agentId,
      projectId: session.projectId,
      title: session.title,
      createdAt: session.createdAt.toISOString(),
      lastMessageAt: session.lastMessageAt.toISOString(),
      messageCount: 0,
    },
  });
}
