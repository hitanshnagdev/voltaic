-- Row-Level Security policies, keyed on the workspace_id GUC set per request.
--
-- Policies are ARMED but NOT currently ENFORCED: the connection role
-- (neondb_owner) has BYPASSRLS=true, so queries run as today. When we add a
-- restricted app role in Phase 10, swap the connection and RLS becomes live.
--
-- All policies gate rows by:
--   workspace_id = current_setting('app.current_workspace_id', true)::uuid
--
-- For tables joined through a parent (e.g. chat_messages -> chat_sessions),
-- we still store workspace_id locally for a simple equality check — no
-- recursive subqueries.

-- Helper macro: apply the default policy to a table.
-- We duplicate the policy body per-table because Postgres does not have
-- macros; kept boringly uniform for auditability.

-- ---------- workspaces ----------
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ws_tenant_isolation ON workspaces;
CREATE POLICY ws_tenant_isolation ON workspaces
  USING (id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (id = current_setting('app.current_workspace_id', true)::uuid);

-- ---------- projects ----------
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS projects_tenant_isolation ON projects;
CREATE POLICY projects_tenant_isolation ON projects
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

-- ---------- documents ----------
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documents_tenant_isolation ON documents;
CREATE POLICY documents_tenant_isolation ON documents
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

-- ---------- document_pages ----------
ALTER TABLE document_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_pages_tenant_isolation ON document_pages;
CREATE POLICY document_pages_tenant_isolation ON document_pages
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

-- ---------- spec_paragraphs ----------
ALTER TABLE spec_paragraphs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spec_paragraphs_tenant_isolation ON spec_paragraphs;
CREATE POLICY spec_paragraphs_tenant_isolation ON spec_paragraphs
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

-- ---------- submittal_fields ----------
ALTER TABLE submittal_fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS submittal_fields_tenant_isolation ON submittal_fields;
CREATE POLICY submittal_fields_tenant_isolation ON submittal_fields
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

-- ---------- drawing_annotations ----------
ALTER TABLE drawing_annotations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS drawing_annotations_tenant_isolation ON drawing_annotations;
CREATE POLICY drawing_annotations_tenant_isolation ON drawing_annotations
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

-- ---------- document_chunks ----------
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_chunks_tenant_isolation ON document_chunks;
CREATE POLICY document_chunks_tenant_isolation ON document_chunks
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

-- ---------- equipment ----------
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS equipment_tenant_isolation ON equipment;
CREATE POLICY equipment_tenant_isolation ON equipment
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

-- ---------- equipment_csi_map ----------
-- NOT tenant-scoped (global seed table). RLS disabled.
-- Intentional: this is read-only reference data shared across workspaces.

-- ---------- findings ----------
ALTER TABLE findings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS findings_tenant_isolation ON findings;
CREATE POLICY findings_tenant_isolation ON findings
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

-- ---------- chat_sessions ----------
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_sessions_tenant_isolation ON chat_sessions;
CREATE POLICY chat_sessions_tenant_isolation ON chat_sessions
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

-- ---------- chat_messages ----------
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_messages_tenant_isolation ON chat_messages;
CREATE POLICY chat_messages_tenant_isolation ON chat_messages
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

-- ---------- llm_calls ----------
ALTER TABLE llm_calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS llm_calls_tenant_isolation ON llm_calls;
CREATE POLICY llm_calls_tenant_isolation ON llm_calls
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

-- ---------- hash_cache ----------
-- NOT tenant-scoped (cross-workspace cache keyed on content hash). RLS
-- disabled. Intentional: cached deterministic extractions of identical
-- content are safe to share (the bytes are already hashed).
