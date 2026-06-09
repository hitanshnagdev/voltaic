-- Workspace settings — Standing-Workflow toggles (one jsonb row per
-- workspace). Additive. RLS armed (matches post/001).

CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  settings     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_settings_tenant_isolation ON workspace_settings;
CREATE POLICY workspace_settings_tenant_isolation ON workspace_settings
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);
