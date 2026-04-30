import { NextResponse } from "next/server";
import { resolveAuthedContext } from "@/lib/agents/auth-helper";
import {
  deleteSession,
  getAgent,
  getSession,
  listMessages,
} from "@/lib/db/agents";

export const runtime = "nodejs";

/**
 * Full session payload — session metadata, the assigned agent, and
 * the message history. One round-trip for the chat shell to mount.
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

  const session = await getSession(ctx.workspaceId, id);
  if (!session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const agent = await getAgent(ctx.workspaceId, session.agentId);
  if (!agent) {
    return NextResponse.json({ error: "agent_missing" }, { status: 404 });
  }
  const messages = await listMessages(ctx.workspaceId, id);

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
      messageCount: messages.length,
    },
    agent,
    messages,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await resolveAuthedContext();
  if (!ctx) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }
  await deleteSession(ctx.workspaceId, id);
  return NextResponse.json({ ok: true });
}
