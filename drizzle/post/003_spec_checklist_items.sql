-- Spec checklist items: per-attribute requirements extracted from spec
-- paragraphs. Phase B of docs/DECISIONS.md U12 — the spec parser produces
-- a structured checklist; the compare page renders that instead of a
-- hardcoded panelboard schema.
--
-- Additive migration. The hardcoded panelboard schema in
-- lib/rag/compare/attributes.ts continues to work as a shim until
-- coverage of this table is non-trivial; both can coexist.
--
-- The unique index on (document_id, content_sha256) lets re-parses run
-- INSERT ... ON CONFLICT DO NOTHING followed by DELETE-by-NOT-IN, same
-- shape as spec_paragraphs (post/002). Re-extracting the same checklist
-- from the same paragraph doesn't generate duplicate rows.

CREATE TABLE IF NOT EXISTS spec_checklist_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id        uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  spec_paragraph_id  uuid REFERENCES spec_paragraphs(id) ON DELETE CASCADE,
  csi_section        text NOT NULL,
  csi_path           text NOT NULL,
  attribute          text NOT NULL,
  required_kind      text NOT NULL,
  comparator         text NOT NULL,
  required_value     jsonb NOT NULL,
  unit               text,
  raw_quote          text NOT NULL,
  confidence         numeric(4,3) NOT NULL DEFAULT 0.8,
  content_sha256     text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spec_checklist_items_workspace_idx
  ON spec_checklist_items (workspace_id);
CREATE INDEX IF NOT EXISTS spec_checklist_items_document_idx
  ON spec_checklist_items (document_id);
CREATE INDEX IF NOT EXISTS spec_checklist_items_csi_section_idx
  ON spec_checklist_items (csi_section);
CREATE INDEX IF NOT EXISTS spec_checklist_items_attribute_idx
  ON spec_checklist_items (attribute);

CREATE UNIQUE INDEX IF NOT EXISTS spec_checklist_items_unique_idx
  ON spec_checklist_items (document_id, content_sha256);

-- RLS: same shape as the rest of post/001 — armed but not enforced until
-- the connection role swap lands. workspace_id is local on every row so
-- the policy is a simple equality on the GUC.
ALTER TABLE spec_checklist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spec_checklist_items_tenant_isolation ON spec_checklist_items;
CREATE POLICY spec_checklist_items_tenant_isolation ON spec_checklist_items
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);
