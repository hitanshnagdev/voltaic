-- Compliance run status — tracks the lifecycle of an explicit user-
-- initiated guided extraction for one (submittal × spec) assignment.
--
-- States:
--   not_run  — assignment exists but extraction has never been queued
--   queued   — POST /api/compliance/run accepted; Inngest event fired
--   running  — extract-against-checklist function flipped this when it
--              actually started the Sonnet vision call
--   ready    — function persisted responses and the table is renderable
--   failed   — Inngest function exhausted retries; UI offers retry
--
-- Survives browser refresh — without this column the /compare empty
-- state can't tell "no run yet" from "run in progress" and shows the
-- misleading "Ready to run" CTA both times.
--
-- last_run_at: when the run finished (success OR failure). null until
-- the first terminal state. Used for "ran 4 minutes ago" timestamps
-- and for staleness detection in v2.

ALTER TABLE submittal_spec_assignments
  ADD COLUMN IF NOT EXISTS compliance_run_status text NOT NULL DEFAULT 'not_run',
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz;

-- Lookup index for /compare to filter to in-flight runs cheaply.
CREATE INDEX IF NOT EXISTS submittal_spec_assignments_run_status_idx
  ON submittal_spec_assignments (compliance_run_status);
