-- Idempotent re-parses must not nuke embeddings on unchanged paragraphs.
--
-- parse-spec computes a stable per-row content_sha256 over
-- (document_id, csi_path, content). With this unique index in place, the
-- save-paragraphs step can:
--
--   1. INSERT ... ON CONFLICT (document_id, content_sha256) DO NOTHING
--      → preserves the existing row (and its `embedding` vector) verbatim
--        when the paragraph is unchanged.
--
--   2. DELETE WHERE document_id = X AND content_sha256 NOT IN (newShas)
--      → drops only paragraphs that vanished from the new parse.
--
-- Without this constraint the only safe re-run shape was delete-all-then-
-- insert, which silently re-emptied the `embedding` column on every parse
-- and forced embed-spec-paragraphs to re-spend Voyage tokens on identical
-- content. That cost compounds at scale.
--
-- CONCURRENTLY so the migration doesn't take a heavy lock on the table.
-- Idempotent via IF NOT EXISTS so re-runs of `npm run db:migrate` are safe.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  spec_paragraphs_doc_content_sha_uniq
  ON spec_paragraphs (document_id, content_sha256);
