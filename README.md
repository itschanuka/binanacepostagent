# Binance Square Content Scheduler

A self-hosted admin dashboard for scheduling and automating content posts to Binance Square via the Square OpenAPI. Built on Next.js + Supabase, fully decoupled from any trading/signal systems.

---

## 1. What This Project Does

This app lets you:

- Bulk-add a batch of pre-written posts (e.g., 500 posts)
- Automatically post them to Binance Square on a fixed schedule (e.g., 100/day)
- Once the batch is fully posted, automatically restart the cycle from post #1 (e.g., 500 posts at 100/day = 5-day cycle, then loop)
- View a history of everything that's been posted (with links to live Square posts)
- Edit, reorder, add, or delete upcoming posts at any time
- Log in as an admin to manage all of the above through a simple UI

It does **not** touch your trading account, trading API keys, or signal/indicator systems in any way. It only uses the Binance Square OpenAPI key, which is scoped exclusively to content posting.

---

## 2. Tech Stack

| Layer | Tool |
|---|---|
| Frontend + Backend | Next.js (App Router) |
| Database + Auth | Supabase (Postgres + Supabase Auth) |
| Hosting | Vercel |
| Scheduler | GitHub Actions (cron) |
| External API | Binance Square OpenAPI |

No Python, no separate microservices, no extra infrastructure. One Next.js app, one Supabase project, one GitHub Actions workflow.

---

## 3. How It Works (High-Level Flow)

```
[Admin Dashboard]            [Supabase DB]              [GitHub Actions Cron]
   |                              |                              |
   | Add/edit/reorder posts ----> | posts table                 |
   | View posted history <------- |                              |
   |                              |                              |
   |                              | <---- every 15 min, fetch    |
   |                              |       next pending post      |
   |                              |                              |
   |                              |        |                     |
   |                              |        v                     |
   |                              |   [Binance Square API]       |
   |                              |        |                     |
   |                              | <---- mark post as 'posted', |
   |                              |       store live post URL    |
   |                              |                              |
   |                              | <---- check if batch done -->|
   |                              |       if yes, reset batch     |
```

The dashboard and the poster never talk to each other directly — they both just read/write the same Supabase tables. This keeps things simple and means the scheduler can run completely independently of whether the dashboard is even online.

---

## 4. Database Schema

### `posts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `content` | text | the post text |
| `image_url` | text, nullable | reserved for future use (Square API currently text-only) |
| `status` | text | `pending` \| `posted` |
| `batch_id` | uuid | groups posts into a cycle |
| `position` | int | order within the batch |
| `square_post_id` | text, nullable | returned by Binance on success |
| `square_post_url` | text, nullable | constructed from `square_post_id` |
| `posted_at` | timestamptz, nullable | when it went live |
| `created_at` | timestamptz | default now() |

### `settings`

| Column | Type | Notes |
|---|---|---|
| `id` | int | single row, id = 1 |
| `daily_limit` | int | e.g. 100 |
| `active_batch_id` | uuid | which batch is currently cycling |
| `cycle_count` | int | how many times the active batch has looped |

### `post_log`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `post_id` | uuid | references `posts.id` |
| `posted_at` | timestamptz | used to compute "how many posted today" |

---

## 5. Core Logic: The Cycle

Each batch of posts (e.g., 500) is tagged with the same `batch_id` and given sequential `position` values (1-500).

On each scheduler run:

1. Check `post_log` for how many posts have `posted_at` within the current UTC day.
2. If today's count >= `daily_limit`, do nothing (exit).
3. Otherwise, fetch the post in the active batch with the lowest `position` and `status = 'pending'`.
4. Post it to Binance Square.
5. On success: set `status = 'posted'`, `posted_at = now()`, store `square_post_id`/`square_post_url`, insert a row into `post_log`.
6. After updating, check: are there any `pending` posts left in the active batch?
   - If **no** → reset all posts in the batch back to `status = 'pending'`, clear `posted_at`/`square_post_url`, increment `settings.cycle_count`. The cycle restarts from position 1 on the next run.
   - If **yes** → nothing further to do.

This gives you exactly the "500 posts, 100/day, restart after 5 days" behavior, and it's fully automatic — no manual intervention needed once a batch is loaded.

---

## 6. Admin Dashboard Pages

### `/admin/login`
Email/password login via Supabase Auth. Only authenticated users can access `/admin/*`.

### `/admin/dashboard`
Overview screen:
- Posts made today / daily limit (e.g., "62 / 100")
- Current cycle progress (e.g., "Batch: Day 3 of 5, 312/500 posted, Cycle #2")
- Quick links to Posted / Upcoming

### `/admin/posted`
Table of all posted content:
- Date posted, content preview, link to live Square post
- Filter by date range
- Read-only (history)

### `/admin/upcoming`
Editable table of pending posts in the active batch:
- Add new post (single or bulk paste — one post per line/separator)
- Edit content inline
- Delete a post
- Drag-and-drop or up/down reorder (changes `position`)

### `/admin/settings`
- Set `daily_limit`
- View/replace the active batch (e.g., upload a new set of 500 and make it the active cycle)
- View cycle history (how many full loops completed)

---

## 7. API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/posts` | GET | List posts (filter by status) |
| `/api/posts` | POST | Create new post(s) |
| `/api/posts/[id]` | PATCH | Edit content/position |
| `/api/posts/[id]` | DELETE | Remove a post |
| `/api/cron/post-square` | POST | Triggered by GitHub Actions; runs the cycle logic in Section 5 |
| `/api/settings` | GET/PATCH | Read/update daily limit, active batch |

The `/api/cron/post-square` route is protected by a shared secret (`CRON_SECRET`) checked against the `Authorization` header — only the GitHub Actions workflow should be able to call it.

---

## 8. Scheduler (GitHub Actions)

```yaml
# .github/workflows/post-square.yml
name: Post to Binance Square
on:
  schedule:
    - cron: '*/10 * * * *'   # every 10 minutes
  workflow_dispatch:          # allows manual trigger from GitHub UI

jobs:
  post:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger poster
        env:
          APP_URL: ${{ vars.APP_URL }}
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
        run: |
          curl --fail-with-body -X POST "$APP_URL/api/cron/post-square" \
            -H "Authorization: Bearer $CRON_SECRET"
```

Runs independently of Vercel's cron limits — no Pro plan required. By default,
the workflow calls the app every 10 minutes, so one due pending post is posted
per 10-minute cycle until the active batch is exhausted.

### GitHub Actions setup

After deploying the app, configure these values in the GitHub repository:

1. Go to **Settings → Secrets and variables → Actions**.
2. Under **Secrets**, add `CRON_SECRET`. This must exactly match the `CRON_SECRET` value configured in Vercel.
3. Under **Variables**, add `APP_URL`, for example `https://your-app.vercel.app`. Do not include a trailing slash.
4. Go to **Actions → Post to Binance Square → Run workflow** to manually test the workflow.

The manual run should call:

```bash
POST $APP_URL/api/cron/post-square
Authorization: Bearer $CRON_SECRET
```

---

## 9. Environment Variables

| Variable | Used by | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | App | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | App (client) | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | API routes | Service role key (server-side only) |
| `BINANCE_SQUARE_API_KEY` | `/api/cron/post-square` | Binance Square OpenAPI key |
| `CRON_SECRET` | `/api/cron/post-square` | Shared secret to authorize GitHub Actions calls |

`CRON_SECRET` and the Square API key must **never** be exposed client-side — only used inside server-side API routes.

---

## 10. Setup Steps

1. Create a Supabase project, run the schema SQL (Section 4) in the SQL editor
2. Create a Supabase Auth user for yourself (admin login)
3. Clone this repo, install dependencies, set environment variables (Section 9)
4. Deploy to Vercel
5. Add `CRON_SECRET` to both Vercel env vars and GitHub repo secrets
6. Enable the GitHub Actions workflow (Section 8)
7. Log into `/admin`, go to Settings, set `daily_limit` (e.g., 100)
8. Go to Upcoming, bulk-add your first batch of posts (e.g., 500)
9. Done — the cycle runs automatically from here

---

## 11. Future Considerations (Not in v1)

- **Image posts**: not currently supported by the Binance Square OpenAPI (`bodyTextOnly` only as of writing). `image_url` column is reserved for if/when this becomes available.
- **AI-generated content**: a separate Python script (run via its own GitHub Actions cron) could generate posts from market data and insert directly into the `posts` table — fully decoupled from this app, no architecture changes needed here.
- **Multiple batches**: the schema supports multiple `batch_id`s, so you could prepare a "next" batch while the current one is still cycling, then switch `active_batch_id` when ready.

---

## 12. Notes on Limits

- The 100/day limit is assumed to be **account-level**, shared between manual posts (via the Binance app) and API posts. If you also post manually, account for that in `daily_limit`.
- Binance Square's content API enforces additional checks (sensitive content detection, identity verification requirements). Failed posts are logged with their error but `status` stays `pending` so they're retried — consider adding a max-retry/skip rule if a specific post repeatedly fails.
