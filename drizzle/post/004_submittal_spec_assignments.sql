-- Submittal-to-spec assignments: many-to-many link between submittal
-- documents and spec documents (optionally narrowed to a CSI section).
-- The compare page joins on this table to know which spec checklist
-- drives the comparison for any given submittal — replaces the prior
-- implicit `tag_normalized` matching, which silently failed when vendor
-- cut sheets didn't carry the project tag on their cover.
--
-- Additive migration. The existing tag_normalized join in the compare
-- data layer continues to work as a fallback while consumers migrate.

CREATE TABLE IF NOT EXISTS submittal_spec_assignments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  submittal_document_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  spec_document_id       uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  csi_section            text,
  source                 text NOT NULL DEFAULT 'manual',
  confidence             numeric(4,3),
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS submittal_spec_assignments_workspace_idx
  ON submittal_spec_assignments (workspace_id);
CREATE INDEX IF NOT EXISTS submittal_spec_assignments_submittal_idx
  ON submittal_spec_assignments (submittal_document_id);
CREATE INDEX IF NOT EXISTS submittal_spec_assignments_spec_idx
  ON submittal_spec_assignments (spec_document_id);

-- Same (submittal, spec, csi_section) triple shouldn't appear twice.
-- Unique index treats NULL csi_section as a distinct value (Postgres
-- default), which is what we want: "assigned to whole spec doc" vs
-- "assigned to specific CSI section" are different rows.
CREATE UNIQUE INDEX IF NOT EXISTS submittal_spec_assignments_unique_idx
  ON submittal_spec_assignments (
    submittal_document_id,
    spec_document_id,
    csi_section
  );

-- RLS: same shape as the rest of post/001 — armed but not enforced
-- until the connection role swap lands. workspace_id is local on every
-- row so the policy is a simple equality on the GUC.
ALTER TABLE submittal_spec_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS submittal_spec_assignments_tenant_isolation
  ON submittal_spec_assignments;
CREATE POLICY submittal_spec_assignments_tenant_isolation
  ON submittal_spec_assignments
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);
