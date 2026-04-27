-- Submittal responses to spec checklist items.
--
-- Phase B PR 3 of docs/DECISIONS.md U12: once a submittal is assigned
-- to a spec, the vision call gets the spec's checklist as context and
-- returns one response per item. This table stores those responses.
--
-- The unique index on (submittal_document_id, spec_checklist_item_id)
-- supports the same INSERT-on-conflict-DO-NOTHING + DELETE-by-NOT-IN
-- idempotency shape as spec_paragraphs / spec_checklist_items.

CREATE TABLE IF NOT EXISTS submittal_checklist_responses (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  submittal_document_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  spec_checklist_item_id uuid NOT NULL REFERENCES spec_checklist_items(id) ON DELETE CASCADE,
  found                  boolean NOT NULL DEFAULT true,
  value                  jsonb,
  evidence_quote         text,
  page_num               int,
  confidence             numeric(4,3) NOT NULL DEFAULT 0.8,
  content_sha256         text NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS submittal_checklist_responses_workspace_idx
  ON submittal_checklist_responses (workspace_id);
CREATE INDEX IF NOT EXISTS submittal_checklist_responses_submittal_idx
  ON submittal_checklist_responses (submittal_document_id);
CREATE INDEX IF NOT EXISTS submittal_checklist_responses_item_idx
  ON submittal_checklist_responses (spec_checklist_item_id);

CREATE UNIQUE INDEX IF NOT EXISTS submittal_checklist_responses_unique_idx
  ON submittal_checklist_responses (submittal_document_id, spec_checklist_item_id);

-- RLS: same shape as the rest of post/001 — armed but not enforced
-- until the connection role swap lands.
ALTER TABLE submittal_checklist_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS submittal_checklist_responses_tenant_isolation
  ON submittal_checklist_responses;
CREATE POLICY submittal_checklist_responses_tenant_isolation
  ON submittal_checklist_responses
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);
