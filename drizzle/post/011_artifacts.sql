-- Artifacts — user-facing drafted deliverables (RFIs, compliance reports,
-- change orders, recap emails, filled templates). Peer of `findings`;
-- structured-JSON content with inline citations + a status lifecycle.
-- Additive. Mirrors lib/db/schema.ts. RLS armed (matches post/001).

CREATE TABLE IF NOT EXISTS artifacts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id           uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type                 text NOT NULL,
  title                text NOT NULL,
  status               text NOT NULL DEFAULT 'draft',
  content              jsonb NOT NULL DEFAULT '{}'::jsonb,
  finding_ids          uuid[] NOT NULL DEFAULT '{}',
  source_document_ids  uuid[] NOT NULL DEFAULT '{}',
  template_document_id uuid,
  trigger              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS artifacts_project_idx ON artifacts (project_id);
CREATE INDEX IF NOT EXISTS artifacts_workspace_idx ON artifacts (workspace_id);
CREATE INDEX IF NOT EXISTS artifacts_type_idx ON artifacts (type);

ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS artifacts_tenant_isolation ON artifacts;
CREATE POLICY artifacts_tenant_isolation ON artifacts
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);
