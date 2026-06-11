# AGENTS.md — Build Plan: Binance Square Content Scheduler

This file is a phased build plan for an AI coding agent (e.g., Claude Code) to build the project described in `README.md`. Follow phases in order — each phase should be completed, tested, and working before moving to the next. Do not skip ahead.

---

## Ground Rules

- This project is **fully decoupled** from any existing trading/signal codebase. Do not import from, modify, or reference any trading/signal system files.
- Only the Binance Square OpenAPI key is used (`BINANCE_SQUARE_API_KEY`). Never request, store, or use trading API keys.
- All secrets (`SUPABASE_SERVICE_ROLE_KEY`, `BINANCE_SQUARE_API_KEY`, `CRON_SECRET`) must only be used server-side (API routes), never exposed to the client.
- Use the App Router (Next.js 14+).
- Keep components small and colocated by feature (`/app/admin/upcoming/`, `/app/admin/posted/`, etc.).
- After each phase, run the app locally and confirm the phase's "Done When" criteria before proceeding.
- Refer to `README.md` for full schema, API contract, and architecture details — this file only sequences the work.

---

## Phase 0 — Project Setup

**Goal:** Working Next.js project connected to Supabase.

Tasks:
- Initialize Next.js app (App Router, TypeScript)
- Install dependencies: `@supabase/supabase-js`, `@supabase/ssr`
- Create `.env.local` with placeholders for all variables listed in `README.md` Section 9
- Set up Supabase client helper (`/lib/supabase/client.ts` for browser, `/lib/supabase/server.ts` for server-side with service role)
- Create `.env.example` documenting all required vars (no real values)

**Done when:** App runs locally with `npm run dev`, Supabase client initializes without errors.

---

## Phase 1 — Database Schema

**Goal:** All tables from `README.md` Section 4 exist in Supabase.

Tasks:
- Write SQL migration file (`/supabase/migrations/0001_init.sql`) creating:
  - `posts` table
  - `settings` table (insert one default row: `daily_limit = 100`)
  - `post_log` table
- Add appropriate indexes (`posts.batch_id`, `posts.status`, `post_log.posted_at`)
- Enable Row Level Security; add policy allowing only authenticated users to read/write `posts`, `settings`, `post_log`
- Document how to run the migration (Supabase SQL editor or CLI) in `/supabase/README.md`

**Done when:** Tables exist in Supabase dashboard, RLS is enabled, default settings row is present.

---

## Phase 2 — Admin Authentication

**Goal:** `/admin/*` routes require login; everything else is inaccessible without auth.

Tasks:
- Build `/app/admin/login/page.tsx` — email/password form using Supabase Auth
- Add middleware (`/middleware.ts`) protecting all `/admin/*` routes — redirect to `/admin/login` if unauthenticated
- Add a logout action/button
- Create one admin user manually in Supabase Auth dashboard (document this step in README, not in code)

**Done when:** Visiting `/admin/dashboard` while logged out redirects to login; logging in with valid credentials grants access; logging out revokes it.

---

## Phase 3 — Binance Square Integration & Cycle Logic

**Goal:** Core posting + cycle logic works, callable via a protected API route.

Tasks:
- Create `/lib/binanceSquare.ts` — `postToSquare(text: string)` function per `README.md` Section 1 (endpoint, headers, error handling for non-`000000` codes)
- Create `/app/api/cron/post-square/route.ts` implementing the full cycle logic from `README.md` Section 5:
  1. Verify `Authorization: Bearer ${CRON_SECRET}` header, reject if invalid
  2. Count today's posts from `post_log`; if >= `daily_limit`, return early
  3. Fetch lowest-`position` `pending` post in the active batch
  4. If none found, return early ("queue empty")
  5. Call `postToSquare`
  6. On success: update post (`status='posted'`, `posted_at`, `square_post_id`, `square_post_url`), insert `post_log` row
  7. On failure: log error, leave post `pending`, return error in response (do not crash)
  8. After update, check if any `pending` posts remain in active batch — if none, reset entire batch to `pending` (clear `posted_at`/`square_post_url`/`square_post_id`), increment `settings.cycle_count`

**Done when:** Manually calling this route (via curl/Postman with correct `CRON_SECRET`) posts the next pending item to a real or test Square account, updates the DB correctly, and correctly resets the batch when exhausted (test with a small batch of 2-3 posts to verify reset logic quickly).

---

## Phase 4 — Posts CRUD API

**Goal:** Full CRUD for managing posts, used by the admin UI.

Tasks:
- `/app/api/posts/route.ts`:
  - `GET` — list posts, support `?status=pending|posted` and `?batch_id=` query params
  - `POST` — create one or many posts (accept array for bulk-paste import); auto-assign `position` (append to end of active batch) and `batch_id` (active batch from settings, or create new batch if none active)
- `/app/api/posts/[id]/route.ts`:
  - `PATCH` — update `content` and/or `position`
  - `DELETE` — remove post; re-sequence remaining `position` values in that batch to stay contiguous
- `/app/api/settings/route.ts`:
  - `GET` — return current settings + computed cycle progress (posted count in active batch / total in active batch, today's post count)
  - `PATCH` — update `daily_limit`, switch `active_batch_id`

**Done when:** All endpoints tested via curl/Postman — can create, list, edit, delete, and reorder posts; settings reflect accurate cycle progress.

---

## Phase 5 — Admin UI: Upcoming Posts

**Goal:** `/admin/upcoming` — manage the queue.

Tasks:
- Table view of all `pending` posts in active batch, ordered by `position`
- "Add post" form (single text input + submit)
- "Bulk import" — textarea where each line/paragraph (separated by a configurable delimiter, e.g., `---`) becomes a new post
- Inline edit (click to edit content, save/cancel)
- Delete button per row with confirmation
- Reorder controls (up/down arrows are sufficient — drag-and-drop is optional polish)
- Show position number and a content preview (truncated)

**Done when:** Can add, edit, delete, and reorder posts through the UI; changes persist and reflect immediately (refetch or optimistic update).

---

## Phase 6 — Admin UI: Posted History

**Goal:** `/admin/posted` — read-only history view.

Tasks:
- Table of `posted` posts, newest first: date/time posted, content preview, link to `square_post_url` (opens in new tab)
- Date range filter (default: last 7 days)
- Pagination (20-50 rows per page)

**Done when:** Posted items appear correctly after Phase 3's cron route runs, links work, filtering/pagination work.

---

## Phase 7 — Admin UI: Dashboard & Settings

**Goal:** `/admin/dashboard` and `/admin/settings`.

Dashboard tasks:
- Show: today's posts vs `daily_limit` (e.g., "62 / 100")
- Show: active batch progress (e.g., "Batch 312/500 posted, Cycle #2")
- Quick links to Upcoming and Posted pages

Settings tasks:
- Form to update `daily_limit`
- Display `cycle_count` for active batch
- (Optional, if time allows) ability to start a "new batch" — bulk-replace the active batch with a freshly pasted set of posts, resetting `cycle_count` to 0

**Done when:** Dashboard numbers match DB state; updating `daily_limit` via Settings is reflected in Phase 3's cron logic on next run.

---

## Phase 8 — Scheduler (GitHub Actions)

**Goal:** Automated, scheduled execution of the cron route without relying on Vercel's cron limits.

Tasks:
- Create `.github/workflows/post-square.yml` per `README.md` Section 8 (every 15 min + `workflow_dispatch` for manual runs)
- Document in repo README: how to set `CRON_SECRET` as a GitHub repo secret, and how to set the production URL in the workflow

**Done when:** Manually triggering the workflow via GitHub UI (`workflow_dispatch`) successfully calls the deployed `/api/cron/post-square` route and posts content.

---

## Phase 9 — Deployment & Final Checks

**Goal:** Live, working system end to end.

Tasks:
- Deploy to Vercel; set all env vars from `README.md` Section 9 in Vercel project settings
- Set `CRON_SECRET` in both Vercel and GitHub repo secrets (must match)
- Verify RLS policies don't block the service-role key used in `/api/cron/post-square`
- Run a full end-to-end test: add 3 test posts via Upcoming page → trigger GitHub Action manually 3x → confirm all 3 appear in Posted history with valid Square links → confirm batch reset triggers on the 3rd post

**Done when:** Full cycle (add → post → log → reset) works on the live deployment without manual DB intervention.

---

## Out of Scope (Do Not Build Unless Explicitly Requested Later)

- Image upload/posting (Square API is text-only as of this writing)
- Multi-user/multi-account support
- AI-generated content pipelines (kept as a separate, independent project per `README.md` Section 11)
- Analytics/engagement tracking on posts
