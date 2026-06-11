import { getUtcDayRange } from "@/lib/api";
import { postToSquare } from "@/lib/binanceSquare";
import type { Post, Settings } from "@/lib/database.types";
import { buildSquarePostText } from "@/lib/squareContent";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type PostingResult =
  | {
      ok: true;
      message: string;
      post?: {
        id: string;
        squarePostId: string;
        squarePostUrl: string | null;
      };
      cycleReset?: boolean;
    }
  | {
      ok: false;
      message: string;
      status: number;
    };

async function readSettings() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("settings")
    .select("id,daily_limit,active_batch_id,cycle_count,post_interval_minutes")
    .eq("id", 1)
    .single<Settings>();

  if (error || !data) {
    throw new Error(error?.message ?? "Settings row not found");
  }

  return data;
}

async function checkDailyLimit(settings: Settings) {
  const supabase = createServiceRoleClient();
  const { start, end } = getUtcDayRange();
  const { count, error } = await supabase
    .from("post_log")
    .select("id", { count: "exact", head: true })
    .gte("posted_at", start)
    .lt("posted_at", end);

  if (error) {
    throw new Error(error.message);
  }

  return (count ?? 0) < settings.daily_limit;
}

async function resetBatchIfFinished(settings: Settings) {
  const supabase = createServiceRoleClient();

  if (!settings.active_batch_id) {
    return false;
  }

  const { count, error } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", settings.active_batch_id)
    .eq("status", "pending");

  if (error) {
    throw new Error(error.message);
  }

  if ((count ?? 0) > 0) {
    return false;
  }

  const { error: resetError } = await supabase
    .from("posts")
    .update({
      status: "pending",
      posted_at: null,
      square_post_id: null,
      square_post_url: null,
      scheduled_for: null,
    })
    .eq("batch_id", settings.active_batch_id);

  if (resetError) {
    throw new Error(resetError.message);
  }

  const { error: cycleError } = await supabase
    .from("settings")
    .update({
      cycle_count: settings.cycle_count + 1,
    })
    .eq("id", 1);

  if (cycleError) {
    throw new Error(cycleError.message);
  }

  return true;
}

async function markPosted(post: Post, settings: Settings) {
  const supabase = createServiceRoleClient();
  const postedAt = new Date().toISOString();
  const squareResult = await postToSquare(buildSquarePostText(post));

  const { error: updateError } = await supabase
    .from("posts")
    .update({
      status: "posted",
      posted_at: postedAt,
      square_post_id: squareResult.postId,
      square_post_url: squareResult.postUrl,
    })
    .eq("id", post.id)
    .eq("status", "pending");

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: logError } = await supabase.from("post_log").insert({
    post_id: post.id,
    posted_at: postedAt,
  });

  if (logError) {
    throw new Error(logError.message);
  }

  const cycleReset = await resetBatchIfFinished(settings);

  return {
    ok: true,
    message: "Posted to Binance Square",
    post: {
      id: post.id,
      squarePostId: squareResult.postId,
      squarePostUrl: squareResult.postUrl,
    },
    cycleReset,
  } satisfies PostingResult;
}

export async function postNextScheduledToSquare(): Promise<PostingResult> {
  const supabase = createServiceRoleClient();

  try {
    const settings = await readSettings();
    const underDailyLimit = await checkDailyLimit(settings);

    if (!underDailyLimit) {
      return { ok: true, message: "Daily limit reached" };
    }

    if (!settings.active_batch_id) {
      return { ok: true, message: "No active batch configured" };
    }

    const now = new Date().toISOString();
    const { data: nextPost, error } = await supabase
      .from("posts")
      .select("*")
      .eq("batch_id", settings.active_batch_id)
      .eq("status", "pending")
      .or(`scheduled_for.is.null,scheduled_for.lte.${now}`)
      .order("scheduled_for", { ascending: true, nullsFirst: true })
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle<Post>();

    if (error) {
      return { ok: false, message: error.message, status: 500 };
    }

    if (!nextPost) {
      return { ok: true, message: "No scheduled posts are due" };
    }

    return await markPosted(nextPost, settings);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Failed to post to Square",
      status: 502,
    };
  }
}

export async function postSinglePostToSquare(postId: string): Promise<PostingResult> {
  const supabase = createServiceRoleClient();

  try {
    const settings = await readSettings();
    const underDailyLimit = await checkDailyLimit(settings);

    if (!underDailyLimit) {
      return { ok: true, message: "Daily limit reached" };
    }

    const { data: post, error } = await supabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .eq("status", "pending")
      .maybeSingle<Post>();

    if (error) {
      return { ok: false, message: error.message, status: 500 };
    }

    if (!post) {
      return { ok: false, message: "Pending post not found", status: 404 };
    }

    return await markPosted(post, settings);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Failed to post to Square",
      status: 502,
    };
  }
}
