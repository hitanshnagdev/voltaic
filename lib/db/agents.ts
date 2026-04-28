import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  RETRIEVAL_LIMIT_DEFAULT,
  RETRIEVAL_LIMIT_MAX,
  RETRIEVAL_LIMIT_MIN,
  clampRetrievalLimit,
} from "@/lib/agents/limits";
import { db } from "./client";
import {
  type Agent,
  type ChatMessage,
  type ChatSession,
  agents,
  chatMessages,
  chatSessions,
  llmCalls,
} from "./schema";

// Re-export the limits so existing import paths keep working.
export {
  RETRIEVAL_LIMIT_DEFAULT,
  RETRIEVAL_LIMIT_MAX,
  RETRIEVAL_LIMIT_MIN,
  clampRetrievalLimit,
};

export type SourceFilters = { specs: boolean; submittals: boolean };

export const DEFAULT_SOURCE_FILTERS: SourceFilters = {
  specs: true,
  submittals: true,
};

function parseSourceFilters(value: unknown): SourceFilters {
  if (!value || typeof value !== "object") return DEFAULT_SOURCE_FILTERS;
  const v = value as Record<string, unknown>;
  return {
    specs: v.specs !== false,
    submittals: v.submittals !== false,
  };
}

export type SerializedAgent = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  customPrompt: string | null;
  model: string;
  temperature: number;
  sourceFilters: SourceFilters;
  retrievalLimit: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};


function serializeAgent(row: Agent): SerializedAgent {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    systemPrompt: row.systemPrompt,
    customPrompt: row.customPrompt,
    model: row.model,
    temperature: Number(row.temperature),
    sourceFilters: parseSourceFilters(row.sourceFilters),
    retrievalLimit: clampRetrievalLimit(Number(row.retrievalLimit)),
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------- agent CRUD ----------

export async function listAgents(workspaceId: string) {
  const rows = await db
    .select()
    .from(agents)
    .where(eq(agents.workspaceId, workspaceId))
    .orderBy(desc(agents.isDefault), asc(agents.createdAt));
  return rows.map(serializeAgent);
}

export async function getAgent(workspaceId: string, agentId: string) {
  const rows = await db
    .select()
    .from(agents)
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)))
    .limit(1);
  return rows[0] ? serializeAgent(rows[0]) : null;
}

export type CreateAgentInput = {
  workspaceId: string;
  name: string;
  description?: string | null;
  systemPrompt: string;
  customPrompt?: string | null;
  model?: string;
  temperature?: number;
  sourceFilters?: SourceFilters;
  retrievalLimit?: number;
};

export async function createAgent(input: CreateAgentInput) {
  const inserted = await db
    .insert(agents)
    .values({
      workspaceId: input.workspaceId,
      name: input.name.trim(),
      description: input.description ?? null,
      systemPrompt: input.systemPrompt,
      customPrompt: input.customPrompt ?? null,
      model: input.model ?? "claude-sonnet-4-6",
      temperature: (input.temperature ?? 0.2).toFixed(2),
      sourceFilters: input.sourceFilters ?? DEFAULT_SOURCE_FILTERS,
      retrievalLimit: clampRetrievalLimit(
        input.retrievalLimit ?? RETRIEVAL_LIMIT_DEFAULT,
      ),
      isDefault: false,
    })
    .returning();
  return serializeAgent(inserted[0]);
}

export type UpdateAgentInput = {
  name?: string;
  description?: string | null;
  systemPrompt?: string;
  customPrompt?: string | null;
  model?: string;
  temperature?: number;
  sourceFilters?: SourceFilters;
  retrievalLimit?: number;
};

export async function updateAgent(
  workspaceId: string,
  agentId: string,
  patch: UpdateAgentInput,
) {
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.systemPrompt !== undefined)
    update.systemPrompt = patch.systemPrompt;
  if (patch.customPrompt !== undefined)
    update.customPrompt = patch.customPrompt;
  if (patch.model !== undefined) update.model = patch.model;
  if (patch.temperature !== undefined)
    update.temperature = patch.temperature.toFixed(2);
  if (patch.sourceFilters !== undefined)
    update.sourceFilters = patch.sourceFilters;
  if (patch.retrievalLimit !== undefined)
    update.retrievalLimit = clampRetrievalLimit(patch.retrievalLimit);

  const updated = await db
    .update(agents)
    .set(update)
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)))
    .returning();
  return updated[0] ? serializeAgent(updated[0]) : null;
}

/**
 * Delete an agent. Refuses on the seeded default — `is_default = true`
 * is the workspace's permanent Compliance Reviewer. Returns true on
 * delete, false if the agent didn't exist or was the default.
 */
export async function deleteAgent(workspaceId: string, agentId: string) {
  const target = await db
    .select({ isDefault: agents.isDefault })
    .from(agents)
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)))
    .limit(1);
  if (!target[0]) return { deleted: false, reason: "not_found" as const };
  if (target[0].isDefault)
    return { deleted: false, reason: "is_default" as const };
  await db
    .delete(agents)
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)));
  return { deleted: true, reason: null };
}

// ---------- sessions ----------

export type SerializedSession = {
  id: string;
  agentId: string;
  projectId: string;
  title: string | null;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
};

export async function listSessions(params: {
  workspaceId: string;
  agentId: string;
  projectId: string;
  limit?: number;
}) {
  const limit = params.limit ?? 50;
  const rows = await db
    .select({
      id: chatSessions.id,
      agentId: chatSessions.agentId,
      projectId: chatSessions.projectId,
      title: chatSessions.title,
      createdAt: chatSessions.createdAt,
      lastMessageAt: chatSessions.lastMessageAt,
      messageCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${chatMessages}
        WHERE ${chatMessages.sessionId} = ${chatSessions.id}
      )`,
    })
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.workspaceId, params.workspaceId),
        eq(chatSessions.agentId, params.agentId),
        eq(chatSessions.projectId, params.projectId),
      ),
    )
    .orderBy(desc(chatSessions.lastMessageAt))
    .limit(limit);

  return rows.map(
    (r): SerializedSession => ({
      id: r.id,
      agentId: r.agentId,
      projectId: r.projectId,
      title: r.title,
      createdAt: r.createdAt.toISOString(),
      lastMessageAt: r.lastMessageAt.toISOString(),
      messageCount: Number(r.messageCount ?? 0),
    }),
  );
}

export async function getSession(workspaceId: string, sessionId: string) {
  const rows = await db
    .select()
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.workspaceId, workspaceId),
        eq(chatSessions.id, sessionId),
      ),
    )
    .limit(1);
  return rows[0] as ChatSession | undefined;
}

export async function createSession(input: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  title?: string | null;
}) {
  const inserted = await db
    .insert(chatSessions)
    .values({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      agentId: input.agentId,
      title: input.title ?? null,
    })
    .returning();
  return inserted[0];
}

export async function updateSessionTitle(
  workspaceId: string,
  sessionId: string,
  title: string,
) {
  const updated = await db
    .update(chatSessions)
    .set({ title })
    .where(
      and(
        eq(chatSessions.workspaceId, workspaceId),
        eq(chatSessions.id, sessionId),
      ),
    )
    .returning();
  return updated[0];
}

export async function touchSession(workspaceId: string, sessionId: string) {
  await db
    .update(chatSessions)
    .set({ lastMessageAt: new Date() })
    .where(
      and(
        eq(chatSessions.workspaceId, workspaceId),
        eq(chatSessions.id, sessionId),
      ),
    );
}

export async function deleteSession(workspaceId: string, sessionId: string) {
  await db
    .delete(chatSessions)
    .where(
      and(
        eq(chatSessions.workspaceId, workspaceId),
        eq(chatSessions.id, sessionId),
      ),
    );
}

// ---------- messages ----------

export type SerializedMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  citations: SerializedCitation[];
  createdAt: string;
};

/**
 * One stored citation = one retrieved atom that was cited at least once
 * in the assistant's response. Atoms are numbered [#1], [#2], ... in the
 * stream — `index` is that number; `atom` is the metadata snapshot the
 * client renders (so the popover doesn't have to re-query the DB).
 */
export type SerializedCitation = {
  index: number;
  atom: {
    id: string;
    sourceKind: string;
    documentId: string;
    documentName?: string | null;
    pageNum: number | null;
    csiSection: string | null;
    csiPath: string | null;
    snippet: string;
  };
};

export async function listMessages(workspaceId: string, sessionId: string) {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.workspaceId, workspaceId),
        eq(chatMessages.sessionId, sessionId),
      ),
    )
    .orderBy(asc(chatMessages.createdAt));

  return rows.map((r): SerializedMessage => {
    const citations = Array.isArray(r.citations)
      ? (r.citations as unknown as SerializedCitation[])
      : [];
    return {
      id: r.id,
      sessionId: r.sessionId,
      role: r.role === "assistant" ? "assistant" : "user",
      content: r.content,
      citations,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export async function appendMessage(input: {
  workspaceId: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  citations?: SerializedCitation[];
  citedDocumentIds?: string[];
}): Promise<ChatMessage> {
  const inserted = await db
    .insert(chatMessages)
    .values({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      citations: (input.citations ?? []) as unknown as ChatMessage["citations"],
      citedDocumentIds: input.citedDocumentIds ?? [],
    })
    .returning();
  return inserted[0];
}

// ---------- per-session cost ----------

/**
 * Sum cost for one session. Joins llm_calls by `meta->>'sessionId'`
 * (set by the orchestrator on every chat call) so the meter shows
 * spend for THIS conversation rather than the whole project.
 */
export async function getSessionCost(workspaceId: string, sessionId: string) {
  const rows = await db
    .select({
      tokensIn: sql<number>`COALESCE(SUM(${llmCalls.tokensIn}), 0)::int`,
      tokensOut: sql<number>`COALESCE(SUM(${llmCalls.tokensOut}), 0)::int`,
      costUsd: sql<string>`COALESCE(SUM(${llmCalls.costUsd}), 0)::text`,
      callCount: sql<number>`COUNT(*)::int`,
    })
    .from(llmCalls)
    .where(
      and(
        eq(llmCalls.workspaceId, workspaceId),
        sql`${llmCalls.meta}->>'sessionId' = ${sessionId}`,
      ),
    );
  const r = rows[0];
  return {
    tokensIn: Number(r?.tokensIn ?? 0),
    tokensOut: Number(r?.tokensOut ?? 0),
    costUsd: Number(r?.costUsd ?? 0),
    callCount: Number(r?.callCount ?? 0),
  };
}
