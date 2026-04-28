import { NextResponse } from "next/server";
import { resolveAuthedContext } from "@/lib/agents/auth-helper";
import {
  type SourceFilters,
  createAgent,
  listAgents,
} from "@/lib/db/agents";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await resolveAuthedContext();
  if (!ctx) {
    return NextResponse.json({ agents: [] });
  }
  const agents = await listAgents(ctx.workspaceId);
  return NextResponse.json({ agents });
}

export async function POST(req: Request) {
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

  const name = typeof b.name === "string" ? b.name.trim() : "";
  const systemPrompt =
    typeof b.systemPrompt === "string" ? b.systemPrompt.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "missing_name" }, { status: 400 });
  }
  if (!systemPrompt) {
    return NextResponse.json(
      { error: "missing_system_prompt" },
      { status: 400 },
    );
  }
  if (name.length > 80) {
    return NextResponse.json({ error: "name_too_long" }, { status: 400 });
  }
  if (systemPrompt.length > 8000) {
    return NextResponse.json(
      { error: "system_prompt_too_long" },
      { status: 400 },
    );
  }

  const description =
    typeof b.description === "string" ? b.description.trim().slice(0, 200) : null;
  const customPrompt =
    typeof b.customPrompt === "string"
      ? b.customPrompt.trim().slice(0, 4000)
      : null;
  const model = typeof b.model === "string" ? b.model : undefined;
  const temperature =
    typeof b.temperature === "number" && b.temperature >= 0 && b.temperature <= 1
      ? b.temperature
      : undefined;
  const sourceFilters = parseSourceFilters(b.sourceFilters);
  const retrievalLimit =
    typeof b.retrievalLimit === "number" ? b.retrievalLimit : undefined;

  const agent = await createAgent({
    workspaceId: ctx.workspaceId,
    name,
    description,
    systemPrompt,
    customPrompt,
    model,
    temperature,
    sourceFilters,
    retrievalLimit,
  });
  return NextResponse.json({ agent });
}

function parseSourceFilters(value: unknown): SourceFilters | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  return {
    specs: v.specs !== false,
    submittals: v.submittals !== false,
  };
}
