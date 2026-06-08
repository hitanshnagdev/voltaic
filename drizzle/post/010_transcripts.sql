-- Meeting transcript layer: per-user OAuth connections + transcripts +
-- utterances. Additive.
--
-- transcript_utterances carry a generated tsvector + a 1024-dim embedding so
-- they join the SAME hybrid retrieval + contradiction engine as
-- spec_paragraphs / submittal_fields, via a new source_kind
-- 'transcript_utterance'. Mirrors lib/db/schema.ts.
--
-- RLS policies are ARMED but not enforced until the restricted app role lands
-- (matches drizzle/post/001_rls_policies.sql).

CREATE TABLE IF NOT EXISTS oauth_integrations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider         text NOT NULL,
  external_user_id text NOT NULL,
  email            text,
  access_token     text NOT NULL,
  refresh_token    text,
  expires_at       timestamptz,
  scopes           text[] NOT NULL DEFAULT '{}',
  raw_profile      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS oauth_integrations_ws_provider_user_idx
  ON oauth_integrations (workspace_id, provider, external_user_id);
CREATE INDEX IF NOT EXISTS oauth_integrations_workspace_idx
  ON oauth_integrations (workspace_id);

CREATE TABLE IF NOT EXISTS transcripts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_type      text NOT NULL DEFAULT 'manual_upload',
  source_id        text,
  title            text,
  r2_key           text NOT NULL,
  content_sha256   text NOT NULL,
  duration_seconds integer,
  recorded_at      timestamptz,
  status           text NOT NULL DEFAULT 'pending',
  meeting_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transcripts_project_idx ON transcripts (project_id);
CREATE INDEX IF NOT EXISTS transcripts_workspace_idx ON transcripts (workspace_id);
CREATE INDEX IF NOT EXISTS transcripts_content_sha_idx ON transcripts (content_sha256);

CREATE TABLE IF NOT EXISTS transcript_utterances (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  transcript_id  uuid NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  idx            integer NOT NULL,
  speaker        text,
  start_ms       integer,
  end_ms         integer,
  content        text NOT NULL,
  content_tsv    tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  embedding      vector(1024),
  equipment_tags text[] NOT NULL DEFAULT '{}',
  content_sha256 text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS transcript_utterances_transcript_idx_idx
  ON transcript_utterances (transcript_id, idx);
CREATE INDEX IF NOT EXISTS transcript_utterances_workspace_idx
  ON transcript_utterances (workspace_id);
CREATE INDEX IF NOT EXISTS transcript_utterances_content_tsv_idx
  ON transcript_utterances USING gin (content_tsv);
CREATE INDEX IF NOT EXISTS transcript_utterances_embedding_idx
  ON transcript_utterances USING hnsw (embedding vector_cosine_ops);

-- RLS (armed, not enforced; mirrors post/001_rls_policies.sql)
ALTER TABLE oauth_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oauth_integrations_tenant_isolation ON oauth_integrations;
CREATE POLICY oauth_integrations_tenant_isolation ON oauth_integrations
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transcripts_tenant_isolation ON transcripts;
CREATE POLICY transcripts_tenant_isolation ON transcripts
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

ALTER TABLE transcript_utterances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transcript_utterances_tenant_isolation ON transcript_utterances;
CREATE POLICY transcript_utterances_tenant_isolation ON transcript_utterances
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);
