"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  SerializedAgent,
  SerializedCitation,
  SerializedMessage,
  SerializedSession,
  SourceFilters,
} from "@/lib/db/agents";
import { AgentRail } from "./AgentRail";
import { ChatHeader } from "./ChatHeader";
import { ChatThread } from "./ChatThread";
import { CitationPopover } from "./CitationPopover";
import { ConfigurePanel } from "./ConfigurePanel";
import { NewAgentDialog } from "./NewAgentDialog";

export type SessionCost = {
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  callCount: number;
};

export function AgentsClient(props: {
  projectName: string;
  initialAgents: SerializedAgent[];
  initialAgentId: string | null;
  initialSessionId: string | null;
}) {
  const [agents, setAgents] = useState<SerializedAgent[]>(props.initialAgents);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(
    props.initialAgentId ?? props.initialAgents[0]?.id ?? null,
  );
  const [sessions, setSessions] = useState<SerializedSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    props.initialSessionId,
  );
  const [messages, setMessages] = useState<SerializedMessage[]>([]);
  const [streaming, setStreaming] = useState<{
    content: string;
    citations: SerializedCitation[];
  } | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [configureOpen, setConfigureOpen] = useState(false);
  const [newAgentOpen, setNewAgentOpen] = useState(false);
  const [citationOpen, setCitationOpen] = useState<SerializedCitation | null>(
    null,
  );
  const [cost, setCost] = useState<SessionCost | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );
  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );

  // ---------- session list (per agent) ----------

  const refreshSessions = useCallback(
    async (agentId: string) => {
      const res = await fetch(`/api/agents/${agentId}/sessions`);
      if (!res.ok) return;
      const json = (await res.json()) as { sessions: SerializedSession[] };
      setSessions(json.sessions);
      // If nothing selected and the URL didn't pin one, pick the most
      // recent. If we have a pinned id but it's not in the list (stale
      // URL), pick most recent too.
      setSelectedSessionId((current) => {
        if (current && json.sessions.some((s) => s.id === current))
          return current;
        return json.sessions[0]?.id ?? null;
      });
    },
    [],
  );

  useEffect(() => {
    if (!selectedAgentId) return;
    // Fetch on agent change — pure data subscription pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSessions(selectedAgentId);
  }, [selectedAgentId, refreshSessions]);

  // ---------- messages (per session) ----------

  const loadMessages = useCallback(async (sessionId: string) => {
    setLoadingMessages(true);
    try {
      const [msgRes, costRes] = await Promise.all([
        fetch(`/api/agents/sessions/${sessionId}`),
        fetch(`/api/agents/sessions/${sessionId}/cost`),
      ]);
      if (msgRes.ok) {
        const json = (await msgRes.json()) as {
          messages: SerializedMessage[];
        };
        setMessages(json.messages);
      }
      if (costRes.ok) {
        const json = (await costRes.json()) as { cost: SessionCost };
        setCost(json.cost);
      }
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedSessionId) {
      // Reset on session deselection.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages([]);
      setCost(null);
      return;
    }
    void loadMessages(selectedSessionId);
  }, [selectedSessionId, loadMessages]);

  // ---------- streaming ----------

  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!selectedAgent) return;
      let sessionId = selectedSessionId;

      // Implicitly create a session if none is selected — matches the
      // "type and go" UX from ChatGPT-style surfaces.
      if (!sessionId) {
        const res = await fetch(
          `/api/agents/${selectedAgent.id}/sessions`,
          { method: "POST" },
        );
        if (!res.ok) return;
        const json = (await res.json()) as { session: SerializedSession };
        setSessions((prev) => [json.session, ...prev]);
        setSelectedSessionId(json.session.id);
        sessionId = json.session.id;
      }

      // Optimistic user message — render immediately.
      const optimisticUser: SerializedMessage = {
        id: `pending-${Date.now()}`,
        sessionId,
        role: "user",
        content: text,
        citations: [],
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUser]);
      setStreamError(null);
      setStreaming({ content: "", citations: [] });

      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const res = await fetch(
          `/api/agents/sessions/${sessionId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: text }),
            signal: ac.signal,
          },
        );
        if (!res.ok || !res.body) {
          const err = await res.text().catch(() => "");
          setStreamError(err || `request failed (${res.status})`);
          setStreaming(null);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let done = false;
        while (!done) {
          const { value, done: streamDone } = await reader.read();
          done = streamDone;
          if (value) buffer += decoder.decode(value, { stream: true });
          // Split on the SSE event boundary `\n\n`.
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const evRaw of events) {
            const ev = parseSseEvent(evRaw);
            if (!ev) continue;
            if (ev.event === "text" && typeof ev.data?.delta === "string") {
              setStreaming((s) =>
                s ? { ...s, content: s.content + ev.data.delta } : s,
              );
            } else if (ev.event === "citations" && Array.isArray(ev.data?.citations)) {
              setStreaming((s) =>
                s ? { ...s, citations: ev.data.citations } : s,
              );
            } else if (ev.event === "done") {
              const content =
                typeof ev.data?.messageId === "string" ? ev.data : null;
              if (content) {
                setStreaming((s) => {
                  const finalContent = s?.content ?? "";
                  const finalCitations = s?.citations ?? [];
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: ev.data.messageId,
                      sessionId: sessionId!,
                      role: "assistant",
                      content: finalContent,
                      citations: finalCitations,
                      createdAt: new Date().toISOString(),
                    },
                  ]);
                  return null;
                });
                if (typeof ev.data.sessionTitle === "string") {
                  const title = ev.data.sessionTitle;
                  setSessions((prev) =>
                    prev.map((s) =>
                      s.id === sessionId
                        ? { ...s, title, lastMessageAt: new Date().toISOString() }
                        : s,
                    ),
                  );
                }
              }
            } else if (ev.event === "error" && typeof ev.data?.message === "string") {
              setStreamError(ev.data.message);
              setStreaming(null);
            }
          }
        }
        // Refresh cost after the turn completes.
        void fetch(`/api/agents/sessions/${sessionId}/cost`)
          .then((r) => r.json())
          .then((j) => setCost(j.cost));
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setStreamError(err instanceof Error ? err.message : "stream_error");
        setStreaming(null);
      }
    },
    [selectedAgent, selectedSessionId],
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(null);
  }, []);

  // ---------- agent CRUD ----------

  const createAgent = useCallback(
    async (input: {
      name: string;
      description: string | null;
      systemPrompt: string;
      customPrompt: string | null;
      model: string;
      temperature: number;
      sourceFilters: SourceFilters;
    }) => {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "create_failed");
      }
      const { agent } = (await res.json()) as { agent: SerializedAgent };
      setAgents((prev) => [...prev, agent]);
      setSelectedAgentId(agent.id);
      setNewAgentOpen(false);
    },
    [],
  );

  const updateAgent = useCallback(
    async (
      agentId: string,
      patch: Partial<{
        name: string;
        description: string | null;
        systemPrompt: string;
        customPrompt: string | null;
        model: string;
        temperature: number;
        sourceFilters: SourceFilters;
      }>,
    ) => {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "update_failed");
      }
      const { agent } = (await res.json()) as { agent: SerializedAgent };
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? agent : a)));
    },
    [],
  );

  const deleteAgent = useCallback(
    async (agentId: string) => {
      const res = await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "delete_failed");
      }
      setAgents((prev) => {
        const next = prev.filter((a) => a.id !== agentId);
        if (agentId === selectedAgentId) {
          setSelectedAgentId(next[0]?.id ?? null);
        }
        return next;
      });
    },
    [selectedAgentId],
  );

  // ---------- session CRUD ----------

  const startNewSession = useCallback(async () => {
    if (!selectedAgentId) return;
    const res = await fetch(`/api/agents/${selectedAgentId}/sessions`, {
      method: "POST",
    });
    if (!res.ok) return;
    const json = (await res.json()) as { session: SerializedSession };
    setSessions((prev) => [json.session, ...prev]);
    setSelectedSessionId(json.session.id);
    setMessages([]);
    setCost(null);
    setStreaming(null);
    setStreamError(null);
  }, [selectedAgentId]);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      await fetch(`/api/agents/sessions/${sessionId}`, { method: "DELETE" });
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== sessionId);
        if (sessionId === selectedSessionId) {
          setSelectedSessionId(next[0]?.id ?? null);
        }
        return next;
      });
    },
    [selectedSessionId],
  );

  return (
    <div className="flex h-full flex-1 overflow-hidden">
      <AgentRail
        agents={agents}
        sessions={sessions}
        selectedAgentId={selectedAgentId}
        selectedSessionId={selectedSessionId}
        onSelectAgent={setSelectedAgentId}
        onSelectSession={setSelectedSessionId}
        onNewAgent={() => setNewAgentOpen(true)}
        onNewSession={startNewSession}
        onDeleteSession={deleteSession}
      />

      <main className="flex flex-1 flex-col overflow-hidden bg-[var(--color-cream)]">
        {selectedAgent ? (
          <>
            <ChatHeader
              agent={selectedAgent}
              session={selectedSession}
              cost={cost}
              configureOpen={configureOpen}
              onToggleConfigure={() => setConfigureOpen((v) => !v)}
              projectName={props.projectName}
            />
            <ChatThread
              agent={selectedAgent}
              session={selectedSession}
              messages={messages}
              streaming={streaming}
              streamError={streamError}
              loading={loadingMessages}
              onSend={sendMessage}
              onCancel={cancelStream}
              onCitationClick={setCitationOpen}
            />
          </>
        ) : (
          <EmptyAgentState onNewAgent={() => setNewAgentOpen(true)} />
        )}
      </main>

      {configureOpen && selectedAgent && (
        <ConfigurePanel
          key={selectedAgent.id}
          agent={selectedAgent}
          onClose={() => setConfigureOpen(false)}
          onUpdate={updateAgent}
          onDelete={deleteAgent}
        />
      )}

      {citationOpen && (
        <CitationPopover
          citation={citationOpen}
          onClose={() => setCitationOpen(null)}
        />
      )}

      {newAgentOpen && (
        <NewAgentDialog
          onClose={() => setNewAgentOpen(false)}
          onCreate={createAgent}
        />
      )}
    </div>
  );
}

function EmptyAgentState({ onNewAgent }: { onNewAgent: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="paper max-w-md p-8 text-center">
        <h2 className="text-base font-semibold text-[var(--color-ink)]">
          No agents yet
        </h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Create an agent to start a conversation against your project corpus.
        </p>
        <button
          onClick={onNewAgent}
          className="mt-6 rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-1.5 text-[13px] font-medium text-[var(--color-ink-soft)] hover:border-[var(--color-line-strong)]"
        >
          Create an agent
        </button>
      </div>
    </div>
  );
}

type ParsedSseEvent = {
  event: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
};

function parseSseEvent(raw: string): ParsedSseEvent | null {
  const lines = raw.split("\n");
  let event: string | null = null;
  let dataLine: string | null = null;
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLine = line.slice(5).trim();
  }
  if (!event || !dataLine) return null;
  try {
    return { event, data: JSON.parse(dataLine) };
  } catch {
    return null;
  }
}
