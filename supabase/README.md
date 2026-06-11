# Supabase Setup

Phase 1 creates the database schema used by the Binance Square Content Scheduler.

## Option 1: Supabase SQL Editor

1. Open your Supabase project dashboard.
2. Go to **SQL Editor**.
3. Open `supabase/migrations/0001_init.sql` from this repository.
4. Copy the full SQL file into the editor.
5. Click **Run**.

After it runs, confirm these items in the Supabase dashboard:

- `posts`, `settings`, and `post_log` tables exist in the `public` schema.
- Row Level Security is enabled for all three tables.
- The `settings` table has one row with `id = 1` and `daily_limit = 100`.

## Option 2: Supabase CLI

If your local project is linked to Supabase, run:

```bash
supabase db push
```

If it is not linked yet, run:

```bash
supabase link --project-ref your-project-ref
supabase db push
```

Replace `your-project-ref` with the reference ID from your Supabase project URL.
