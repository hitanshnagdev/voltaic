-- Ensure required extensions exist. Idempotent.
-- Kept separate from Drizzle-generated migrations so we can evolve them
-- independently.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;
