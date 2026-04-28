-- Agents — user-configurable chat presets scoped to a workspace.
--
-- Per the 2026-04-27 design conversation: chat is its own first-class
-- surface (`/agents`), separate from the structured `/compare` flow.
-- Each workspace seeds a default "Compliance Reviewer" agent on
-- bootstrap (lib/db/workspace.ts seedDefaultAgent). Users create more
-- via the in-app form. The seeded one carries `is_default = true` and
-- the API refuses to delete it.
--
-- `chat_sessions.agent_id` is added NOT NULL because the existing
-- chat tables were never wired to a UI — no rows to backfill. The FK
-- cascades on agent delete (deleting a custom agent removes its
-- conversations); the default agent can't be deleted, so the
-- workspace's history is safe across normal use.

CREATE TABLE IF NOT EXISTS agents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  system_prompt   text NOT NULL,
  custom_prompt   text,
  model           text NOT NULL DEFAULT 'claude-sonnet-4-6',
  temperature     numeric(3,2) NOT NULL DEFAULT 0.20,
  source_filters  jsonb NOT NULL DEFAULT '{"specs":true,"submittals":true}'::jsonb,
  is_default      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agents_workspace_idx ON agents (workspace_id);

-- At most one default agent per workspace. Partial unique index on
-- the `is_default = true` rows; non-default rows are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS agents_workspace_default_idx
  ON agents (workspace_id) WHERE is_default = true;

-- RLS — same shape as post/001 (armed but not enforced until the
-- restricted-role swap). The policy gates by app.current_workspace_id.
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agents_tenant_isolation ON agents;
CREATE POLICY agents_tenant_isolation
  ON agents
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

-- chat_sessions: add agent_id (NOT NULL, FK) + last_message_at +
-- the supporting indexes. No backfill — no rows exist (the chat
-- tables were defined in 0000 but never written to from any UI).
-- If any row sneaks in before this migration runs, the ALTER will
-- fail; that's the right loud failure.
ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS agent_id uuid;

ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz NOT NULL DEFAULT now();

-- Add the FK constraint only if not already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_sessions_agent_id_fkey'
  ) THEN
    ALTER TABLE chat_sessions
      ADD CONSTRAINT chat_sessions_agent_id_fkey
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE;
  END IF;
END$$;

-- Promote agent_id to NOT NULL once the column + FK are in place.
-- Safe because there are no existing chat_sessions rows (verified by
-- the absence of any insert path before this migration).
ALTER TABLE chat_sessions
  ALTER COLUMN agent_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS chat_sessions_agent_idx
  ON chat_sessions (agent_id);
CREATE INDEX IF NOT EXISTS chat_sessions_last_message_idx
  ON chat_sessions (last_message_at);
