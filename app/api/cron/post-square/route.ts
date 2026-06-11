import { NextRequest, NextResponse } from "next/server";
import { getUtcDayRange } from "@/lib/api";
import { postToSquare } from "@/lib/binanceSquare";
import type { Post, Settings } from "@/lib/database.types";
import { createServiceRoleClient } from "@/lib/supabase/server";

type CronResult =
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
    };

function jsonResponse(body: CronResult, status = 200) {
  return NextResponse.json(body, { status });
}

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  return Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return jsonResponse({ ok: false, message: "Unauthorized" }, 401);
  }

  const supabase = createServiceRoleClient();
  const { start, end } = getUtcDayRange();

  const { data: settings, error: settingsError } = await supabase
    .from("settings")
    .select("id,daily_limit,active_batch_id,cycle_count")
    .eq("id", 1)
    .single<Settings>();

  if (settingsError || !settings) {
    return jsonResponse(
      {
        ok: false,
        message: settingsError?.message ?? "Settings row not found",
      },
      500,
    );
  }

  const { count: todaysPostCount, error: countError } = await supabase
    .from("post_log")
    .select("id", { count: "exact", head: true })
    .gte("posted_at", start)
    .lt("posted_at", end);

  if (countError) {
    return jsonResponse({ ok: false, message: countError.message }, 500);
  }

  if ((todaysPostCount ?? 0) >= settings.daily_limit) {
    return jsonResponse({
      ok: true,
      message: "Daily limit reached",
    });
  }

  if (!settings.active_batch_id) {
    return jsonResponse({
      ok: true,
      message: "No active batch configured",
    });
  }

  const { data: nextPost, error: postError } = await supabase
    .from("posts")
    .select("*")
    .eq("batch_id", settings.active_batch_id)
    .eq("status", "pending")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle<Post>();

  if (postError) {
    return jsonResponse({ ok: false, message: postError.message }, 500);
  }

  if (!nextPost) {
    return jsonResponse({
      ok: true,
      message: "Queue empty",
    });
  }

  try {
    const postedAt = new Date().toISOString();
    const squareResult = await postToSquare(nextPost.content);

    const { error: updateError } = await supabase
      .from("posts")
      .update({
        status: "posted",
        posted_at: postedAt,
        square_post_id: squareResult.postId,
        square_post_url: squareResult.postUrl,
      })
      .eq("id", nextPost.id)
      .eq("status", "pending");

    if (updateError) {
      return jsonResponse({ ok: false, message: updateError.message }, 500);
    }

    const { error: logError } = await supabase.from("post_log").insert({
      post_id: nextPost.id,
      posted_at: postedAt,
    });

    if (logError) {
      return jsonResponse({ ok: false, message: logError.message }, 500);
    }

    const { count: pendingCount, error: pendingCountError } = await supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", settings.active_batch_id)
      .eq("status", "pending");

    if (pendingCountError) {
      return jsonResponse(
        { ok: false, message: pendingCountError.message },
        500,
      );
    }

    let cycleReset = false;

    if ((pendingCount ?? 0) === 0) {
      const { error: resetError } = await supabase
        .from("posts")
        .update({
          status: "pending",
          posted_at: null,
          square_post_id: null,
          square_post_url: null,
        })
        .eq("batch_id", settings.active_batch_id);

      if (resetError) {
        return jsonResponse({ ok: false, message: resetError.message }, 500);
      }

      const { error: cycleError } = await supabase
        .from("settings")
        .update({
          cycle_count: settings.cycle_count + 1,
        })
        .eq("id", 1);

      if (cycleError) {
        return jsonResponse({ ok: false, message: cycleError.message }, 500);
      }

      cycleReset = true;
    }

    return jsonResponse({
      ok: true,
      message: "Posted to Binance Square",
      post: {
        id: nextPost.id,
        squarePostId: squareResult.postId,
        squarePostUrl: squareResult.postUrl,
      },
      cycleReset,
    });
  } catch (error) {
    console.error("Failed to post to Binance Square", {
      postId: nextPost.id,
      error,
    });

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to post to Binance Square",
      },
      502,
    );
  }
}
