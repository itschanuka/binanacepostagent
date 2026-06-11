import { NextRequest, NextResponse } from "next/server";
import { apiError, getUtcDayRange } from "@/lib/api";
import type { Settings } from "@/lib/database.types";
import { createServiceRoleClient } from "@/lib/supabase/server";

type PatchSettingsBody = {
  daily_limit?: unknown;
  active_batch_id?: unknown;
  post_interval_minutes?: unknown;
};

function parseDailyLimit(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  const dailyLimit = Number(value);

  if (!Number.isInteger(dailyLimit) || dailyLimit < 1) {
    throw new Error("daily_limit must be a positive integer");
  }

  return dailyLimit;
}

function parseActiveBatchId(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  const batchId = String(value);
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(batchId)) {
    throw new Error("active_batch_id must be a valid UUID");
  }

  return batchId;
}

function parsePostInterval(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  const interval = Number(value);

  if (!Number.isInteger(interval) || interval < 1) {
    throw new Error("post_interval_minutes must be a positive integer");
  }

  return interval;
}

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

export async function GET() {
  const supabase = createServiceRoleClient();

  try {
    const settings = await readSettings();
    const { start, end } = getUtcDayRange();

    const { count: todaysPostCount, error: todaysCountError } = await supabase
      .from("post_log")
      .select("id", { count: "exact", head: true })
      .gte("posted_at", start)
      .lt("posted_at", end);

    if (todaysCountError) {
      return apiError(todaysCountError.message);
    }

    let totalInActiveBatch = 0;
    let postedInActiveBatch = 0;

    if (settings.active_batch_id) {
      const { count: totalCount, error: totalError } = await supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", settings.active_batch_id);

      if (totalError) {
        return apiError(totalError.message);
      }

      const { count: postedCount, error: postedError } = await supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", settings.active_batch_id)
        .eq("status", "posted");

      if (postedError) {
        return apiError(postedError.message);
      }

      totalInActiveBatch = totalCount ?? 0;
      postedInActiveBatch = postedCount ?? 0;
    }

    return NextResponse.json({
      ok: true,
      settings,
      progress: {
        activeBatchId: settings.active_batch_id,
        postedInActiveBatch,
        totalInActiveBatch,
        todaysPostCount: todaysPostCount ?? 0,
      },
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to read settings",
    );
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = createServiceRoleClient();
  let body: PatchSettingsBody;

  try {
    body = (await request.json()) as PatchSettingsBody;
  } catch {
    return apiError("Request body must be valid JSON", 400);
  }

  const updateValues: {
    daily_limit?: number;
    active_batch_id?: string | null;
    post_interval_minutes?: number;
  } = {};

  try {
    const dailyLimit = parseDailyLimit(body.daily_limit);
    const activeBatchId = parseActiveBatchId(body.active_batch_id);
    const postInterval = parsePostInterval(body.post_interval_minutes);

    if (dailyLimit !== undefined) {
      updateValues.daily_limit = dailyLimit;
    }

    if (activeBatchId !== undefined) {
      updateValues.active_batch_id = activeBatchId;
    }

    if (postInterval !== undefined) {
      updateValues.post_interval_minutes = postInterval;
    }
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Invalid settings payload",
      400,
    );
  }

  if (Object.keys(updateValues).length === 0) {
    return apiError("No settings fields provided", 400);
  }

  const { data, error } = await supabase
    .from("settings")
    .update(updateValues)
    .eq("id", 1)
    .select("id,daily_limit,active_batch_id,cycle_count,post_interval_minutes")
    .single<Settings>();

  if (error) {
    return apiError(error.message);
  }

  return NextResponse.json({ ok: true, settings: data });
}
