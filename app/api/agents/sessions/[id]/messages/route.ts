import { NextResponse } from "next/server";
import { resolveAuthedContext } from "@/lib/agents/auth-helper";
import { runAgentChat } from "@/lib/agents/chat";
import {
  getAgent,
  getSession,
  listMessages,
} from "@/lib/db/agents";

export const runtime = "nodejs";
// Allow up to ~60s for slow streams; Vercel hobby caps at 10s but
// the chat surface runs against Sonnet which usually finishes well
// inside that. Bumped to 60 here for self-hosted dev.
export const maxDuration = 60;

/**
 * POST /api/agents/sessions/:id/messages
 *
 * Body: { content: string }
 *
 * Returns a Server-Sent Events stream:
 *   event: text       data: { delta: "..." }
 *   event: citations  data: { citations: [{...}] }
 *   event: done       data: { messageId, sessionTitle, tokensIn, tokensOut, costUsd }
 *   event: error      data: { message: "..." }
 *
 * The client reads the body as a stream, splits on event boundaries,
 * and renders text as it arrives. The done event tells the client
 * the assistant message id (so it can wire up the citation popover)
 * and the final session title (auto-set on the first turn).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await resolveAuthedContext();
  if (!ctx) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const content =
    typeof (body as { content?: unknown }).content === "string"
      ? (body as { content: string }).content
      : "";
  if (!content.trim()) {
    return NextResponse.json({ error: "empty_message" }, { status: 400 });
  }
  if (content.length > 8000) {
    return NextResponse.json({ error: "message_too_long" }, { status: 400 });
  }

  const session = await getSession(ctx.workspaceId, id);
  if (!session) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }
  const agent = await getAgent(ctx.workspaceId, session.agentId);
  if (!agent) {
    return NextResponse.json({ error: "agent_missing" }, { status: 404 });
  }

  // Determine if this is the first turn (drives auto-title behavior).
  const existing = await listMessages(ctx.workspaceId, id);
  const isFirstMessage = existing.length === 0;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(
            `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
          ),
        );
      };

      try {
        for await (const ev of runAgentChat({
          agent,
          sessionId: id,
          workspaceId: ctx.workspaceId,
          projectId: session.projectId,
          userMessage: content,
          isFirstMessage,
          currentTitle: session.title,
        })) {
          if (ev.type === "text") send("text", { delta: ev.delta });
          else if (ev.type === "citations")
            send("citations", { citations: ev.citations });
          else if (ev.type === "done")
            send("done", {
              messageId: ev.messageId,
              sessionTitle: ev.sessionTitle,
              tokensIn: ev.tokensIn,
              tokensOut: ev.tokensOut,
              costUsd: ev.costUsd,
            });
          else if (ev.type === "error")
            send("error", { message: ev.message });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "stream_error";
        send("error", { message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
