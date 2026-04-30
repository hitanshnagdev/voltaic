-- Pair scope on chat sessions — when both columns are set, the
-- /agents retrieval pass restricts to those two documents only,
-- ignoring the rest of the project corpus. Null = whole-project
-- scope (default, prior behavior).
--
-- The PM picks "ask about pair" → "MDP-A submittal × 26 24 16
-- panelboards spec" from the chat header. Every message in that
-- session is then grounded only on those two PDFs — so the model
-- literally cannot cite a doc the user didn't intend to ask about.
--
-- ON DELETE SET NULL: deleting a referenced document drops the
-- scope (session falls back to whole-project) instead of nuking
-- the chat history.

ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS scoped_submittal_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scoped_spec_id uuid REFERENCES documents(id) ON DELETE SET NULL;
