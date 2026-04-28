-- Add agents.retrieval_limit — controls how many retrieved atoms get
-- sent to the LLM per turn. Default 12 (the historical hard-coded
-- value, kept so existing agents preserve their behavior post-migrate).
-- Valid range 4..50 enforced at the API layer; the column itself is
-- a plain int for flexibility.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS retrieval_limit int NOT NULL DEFAULT 12;
