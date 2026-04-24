# Voltaic — Runbook

How to run, deploy, migrate, and rotate secrets. If you're new to the repo, read `DECISIONS.md` first, then this.

---

## Local dev

```bash
nvm use                         # reads .nvmrc → Node 22
npm install
cp .env.example .env.local      # fill in real secrets
npm run db:init                 # one-time: enables pg_trgm + pgcrypto on Neon
npm run verify                  # probes Neon, Anthropic, Voyage, R2
npm run dev                     # http://localhost:3000
```

### Useful scripts

| Script | Use |
|---|---|
| `npm run dev` | Next dev server |
| `npm run build` | Production build (same as Vercel runs) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run verify` | Smoke-tests Neon / Anthropic / Voyage / R2 creds |
| `npm run db:init` | Enables Postgres extensions on a fresh Neon branch |
| `npm run db:generate` | Generates a Drizzle migration from schema changes |
| `npm run db:migrate` | Applies `drizzle/pre/*.sql` → generated SQL → `drizzle/post/*.sql` (idempotent) |
| `npm run db:seed` | Seeds `equipment_csi_map` with canonical CSI mappings |
| `npm run db:reset -- --yes` | **Destructive** — drops & recreates `public` schema (dev only) |
| `npm run db:studio` | Opens Drizzle Studio (browser GUI for the DB) |

### Inngest dev server

Run alongside `npm run dev`:

```bash
npx inngest-cli@latest dev
```

It auto-discovers `/api/inngest` and runs functions locally with hot reload. No `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` needed in local dev — the Inngest dev server handles keys.

---

## Secrets

### Local

`.env.local` (gitignored). Copy template from `.env.example`. Never commit.

### Production (Vercel)

1. Create the Vercel project and link it:
   ```bash
   vercel link
   ```
2. Push env vars for all three environments (development, preview, production):
   ```bash
   vercel env add DATABASE_URL production
   # repeat for each var in .env.example
   ```
   Or paste via the Vercel dashboard (Settings → Environment Variables).
3. Redeploy to pick up new envs: `vercel --prod` or merge to `main`.

### Rotation

Any time a credential has been pasted in chat, email, or otherwise left a transcript:

- **Clerk:** Dashboard → API Keys → rotate. Update Vercel + `.env.local`.
- **Anthropic:** console.anthropic.com → Settings → API Keys → revoke, create new.
- **Voyage:** dash.voyageai.com → API Keys → revoke, create new.
- **Neon:** console.neon.tech → Project → Roles → reset password on `neondb_owner`.
- **R2:** dash.cloudflare.com → R2 → Manage R2 API Tokens → roll.

After rotation, re-run `npm run verify`.

---

## Database

### Migration workflow

Schema lives in `lib/db/schema.ts`. Migrations live in `drizzle/`.

```bash
# Make schema changes in lib/db/schema.ts, then:
npm run db:generate -- --name=add_equipment_table

# Commit the generated SQL file in drizzle/.
# For RLS / extensions / anything Drizzle can't generate, drop SQL files in
# drizzle/pre/ (runs before generated) or drizzle/post/ (runs after).

# To apply:
npm run db:migrate

# npm run db:migrate is idempotent — tracks applied files in the
# voltaic_migrations table. It's safe to re-run on every deploy. We DO NOT
# use `drizzle-kit push`; it bypasses RLS / post-SQL and drifts from the
# migration log.
```

Never edit files in `drizzle/` by hand once committed.

### Neon branches

Each Vercel preview deploy gets its own Neon branch (configured via Neon's Vercel integration). Production uses `main` branch. To nuke a dev branch and start over:

```bash
# In Neon dashboard: delete the branch, recreate from main.
# Then on the new connection string:
npm run db:migrate
npm run db:seed
```

### RLS

Every table with a `workspace_id` has an RLS policy (added in Phase 1):

```sql
workspace_id = current_setting('app.current_workspace_id')::uuid
```

The GUC is set per-request in API middleware from the Clerk `orgId` → `workspaces.id` lookup. If you're running ad-hoc SQL in Drizzle Studio or a script, bypass RLS by connecting as the `neondb_owner` role (the policies are permissive; `neondb_owner` has `BYPASSRLS`).

---

## CI & Deploy

### CI (`.github/workflows/ci.yml`)

Runs on every PR and push to main:

- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npx drizzle-kit generate --name=ci_check` (dry-run — catches schema diffs that wouldn't migrate)

Later (Phase 10): add `npm run eval` with a regression gate.

### Vercel

- Project wired to `github.com/hitanshnagdev/voltaic`.
- Production = `main`. Preview = every PR.
- Env vars set in Vercel dashboard for development / preview / production.
- Neon Vercel integration provides a fresh branch per preview.
- Build command: default (`next build`). Install command: `npm ci`.

### Release flow

1. Open PR.
2. CI green + preview deploy link in PR body.
3. Smoke-test on preview URL (upload a known PDF, verify ingest completes).
4. Merge PR. Production deploy kicks off.
5. Re-run smoke test on production.

---

## Ops playbook (minimal v1)

| Symptom | First look |
|---|---|
| Upload 500s | Vercel logs for `/api/upload`. R2 creds valid? Bucket exists? |
| Ingest stuck in `parsing` | Inngest dashboard → failed runs. Retry or inspect step logs |
| Classify returns `"other"` | Haiku cost log (`llm_calls`). Prompt + first 3 pages text sample |
| `/today` empty | Check `findings` table row count. Next: check `equipment` rows |
| Cost meter high | `llm_calls` aggregated by `purpose`. Usually an unrestricted `chat` call |

---

## Contacts

- GitHub: `github.com/hitanshnagdev/voltaic`
- Inngest dev dashboard: local only for now
- Neon project: (console.neon.tech)
- Clerk dashboard: (dashboard.clerk.com)
- Vercel project: (vercel.com) — added once linked
- Electrical engineering consult: _to be named_ (see `DECISIONS.md` open items)
