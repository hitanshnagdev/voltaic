import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import {
  type SerializedAgent,
  appendMessage,
  listMessages,
  touchSession,
  updateSessionTitle,
} from "@/lib/db/agents";
import { chatStream } from "@/lib/llm";
import { retrieve } from "@/lib/rag/retrieve/hybrid";
import {
  type AtomWithDoc,
  buildContextBlock,
  buildDocumentsBlock,
  extractCitations,
} from "./citations";

export type ChatRunEvent =
  | { type: "text"; delta: string }
  | { type: "citations"; citations: import("@/lib/db/agents").SerializedCitation[] }
  | {
      type: "done";
      messageId: string;
      sessionTitle: string | null;
      tokensIn: number;
      tokensOut: number;
      costUsd: number | null;
    }
  | { type: "error"; message: string };

/**
 * Run one chat turn: persist the user message, retrieve, stream the
 * assistant's response, parse citations, persist the assistant message,
 * touch the session, and (on first turn) auto-title.
 *
 * Yields raw text deltas as they arrive so the API route can SSE-stream
 * to the client. The final `done` event carries the assistant message
 * id and the resolved session title.
 */
export async function* runAgentChat(input: {
  agent: SerializedAgent;
  sessionId: string;
  workspaceId: string;
  projectId: string;
  userMessage: string;
  isFirstMessage: boolean;
  /** Title currently on the session row — passed in so we don't re-query. */
  currentTitle: string | null;
}): AsyncGenerator<ChatRunEvent, void, void> {
  const userText = input.userMessage.trim();
  if (!userText) {
    yield { type: "error", message: "empty_message" };
    return;
  }

  // Persist the user message FIRST so the chat history reflects it
  // even if the LLM call fails. Stored verbatim — no augmentation.
  await appendMessage({
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    role: "user",
    content: userText,
    citations: [],
  });

  // Retrieve project corpus context. Currently retrieve() surfaces
  // only spec_paragraphs; the agent's source_filters.specs flag gates
  // whether we run it at all. submittals=true is recorded but doesn't
  // change retrieval yet (no submittal_fields leg in retrieve).
  let atoms: AtomWithDoc[] = [];
  if (input.agent.sourceFilters.specs !== false) {
    const retrieved = await retrieve({
      query: userText,
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      k: 8,
    });
    atoms = await joinDocumentNames(retrieved);
  }

  // Pull a flat document list so the model can name files in answers
  // ("the MDP-A submittal mentions..."). Bounded to avoid exploding
  // context on document-heavy projects.
  const docList = await db
    .select({
      filename: documents.filename,
      docType: documents.docType,
    })
    .from(documents)
    .where(eq(documents.projectId, input.projectId))
    .limit(50);

  const docsBlock = buildDocumentsBlock(docList);
  const contextBlock = buildContextBlock(atoms);

  // Prior chat history — excluded the just-inserted user message
  // (we'll add the augmented version at the end). The model sees raw
  // user text + assistant responses for prior turns; only the LATEST
  // turn carries the retrieval context. That keeps cached prefixes
  // stable across turns within a session.
  const history = await listMessages(input.workspaceId, input.sessionId);
  const priorTurns = history
    .filter((m) => m.id) // sanity
    .slice(0, -1) // drop the user turn we just inserted
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));

  const augmentedUserContent = [
    docsBlock,
    contextBlock,
    `<question>${userText}</question>`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const systemPrompt = input.agent.customPrompt
    ? `${input.agent.systemPrompt}\n\n${input.agent.customPrompt}`
    : input.agent.systemPrompt;

  const stream = chatStream({
    system: systemPrompt,
    // Cache the system prompt — stable across turns within a session.
    // Retrieved context lives in the user message, which is correctly
    // outside the cache.
    cacheSystem: true,
    messages: [
      ...priorTurns,
      { role: "user" as const, content: augmentedUserContent },
    ],
    model: input.agent.model,
    temperature: input.agent.temperature,
    ctx: {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
    },
    purpose: "chat",
    meta: {
      sessionId: input.sessionId,
      agentId: input.agent.id,
      atomsRetrieved: atoms.length,
    },
  });

  let assembled = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd: number | null = null;
  let streamError: string | null = null;

  for await (const event of stream) {
    if (event.type === "text") {
      assembled += event.delta;
      yield { type: "text", delta: event.delta };
    } else if (event.type === "done") {
      tokensIn = event.tokensIn;
      tokensOut = event.tokensOut;
      costUsd = event.costUsd;
    } else if (event.type === "error") {
      streamError = event.message;
      yield { type: "error", message: event.message };
    }
  }

  if (streamError) return;

  const citations = extractCitations(assembled, atoms);
  const citedDocumentIds = Array.from(
    new Set(citations.map((c) => c.atom.documentId)),
  );

  const persisted = await appendMessage({
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    role: "assistant",
    content: assembled,
    citations,
    citedDocumentIds,
  });

  await touchSession(input.workspaceId, input.sessionId);

  // Auto-title from the first user message if the session is still
  // titleless. Cap at ~60 chars; truncate on word boundary if possible.
  let resolvedTitle = input.currentTitle;
  if (input.isFirstMessage && !input.currentTitle) {
    resolvedTitle = autoTitle(userText);
    await updateSessionTitle(input.workspaceId, input.sessionId, resolvedTitle);
  }

  yield { type: "citations", citations };
  yield {
    type: "done",
    messageId: persisted.id,
    sessionTitle: resolvedTitle,
    tokensIn,
    tokensOut,
    costUsd,
  };
}

async function joinDocumentNames(
  atoms: import("@/lib/rag/retrieve/hybrid").RetrievedAtom[],
): Promise<AtomWithDoc[]> {
  if (atoms.length === 0) return [];
  const ids = Array.from(new Set(atoms.map((a) => a.documentId)));
  const rows = await db
    .select({ id: documents.id, filename: documents.filename })
    .from(documents)
    .where(inArray(documents.id, ids));
  const nameById = new Map(rows.map((r) => [r.id, r.filename]));
  return atoms.map((a) => ({
    ...a,
    documentName: nameById.get(a.documentId) ?? null,
  }));
}

function autoTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 60) return cleaned;
  const cut = cleaned.slice(0, 60);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 30 ? cut.slice(0, lastSpace) : cut) + "…";
}

// Expose internals for testing.
export const _internal = { autoTitle, joinDocumentNames };
