import { NextResponse } from "next/server";
import { resolveAuthedContext } from "@/lib/agents/auth-helper";
import {
  type SourceFilters,
  deleteAgent,
  getAgent,
  updateAgent,
} from "@/lib/db/agents";

export const runtime = "nodejs";

export async function GET(
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
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ agent });
}

export async function PATCH(
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
  const b = body as Record<string, unknown>;

  const patch: Parameters<typeof updateAgent>[2] = {};
  if (typeof b.name === "string") patch.name = b.name.trim().slice(0, 80);
  if (b.description === null) patch.description = null;
  else if (typeof b.description === "string")
    patch.description = b.description.trim().slice(0, 200);
  if (typeof b.systemPrompt === "string")
    patch.systemPrompt = b.systemPrompt.trim().slice(0, 8000);
  if (b.customPrompt === null) patch.customPrompt = null;
  else if (typeof b.customPrompt === "string")
    patch.customPrompt = b.customPrompt.trim().slice(0, 4000);
  if (typeof b.model === "string") patch.model = b.model;
  if (
    typeof b.temperature === "number" &&
    b.temperature >= 0 &&
    b.temperature <= 1
  )
    patch.temperature = b.temperature;
  const sf = parseSourceFilters(b.sourceFilters);
  if (sf) patch.sourceFilters = sf;
  if (typeof b.retrievalLimit === "number" && Number.isFinite(b.retrievalLimit))
    patch.retrievalLimit = b.retrievalLimit;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const updated = await updateAgent(ctx.workspaceId, id, patch);
  if (!updated) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ agent: updated });
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
  const result = await deleteAgent(ctx.workspaceId, id);
  if (!result.deleted) {
    const status = result.reason === "is_default" ? 400 : 404;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json({ ok: true });
}

function parseSourceFilters(value: unknown): SourceFilters | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  return {
    specs: v.specs !== false,
    submittals: v.submittals !== false,
  };
}
