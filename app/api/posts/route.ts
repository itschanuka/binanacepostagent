import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import type { Post, PostContentStyle, Settings } from "@/lib/database.types";
import { createServiceRoleClient } from "@/lib/supabase/server";

type PostInput = {
  content: string;
  image_url?: string | null;
  content_style?: PostContentStyle;
  coin_symbol?: string | null;
  chart_symbol?: string | null;
  chart_interval?: string | null;
};

type CreatePostsBody =
  | {
      content?: string;
      contents?: string[];
      image_url?: string | null;
      content_style?: PostContentStyle;
      coin_symbol?: string | null;
      chart_symbol?: string | null;
      chart_interval?: string | null;
      posts?: Array<Partial<PostInput>>;
    }
  | string[]
  | string;

function cleanOptionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function normalizeSymbol(value: unknown) {
  const text = cleanOptionalText(value);
  return text ? text.replace(/^\$/, "").toUpperCase() : null;
}

function normalizeStyle(value: unknown): PostContentStyle {
  const allowed: PostContentStyle[] = [
    "market_update",
    "news",
    "analysis",
    "education",
    "question",
  ];

  return allowed.includes(value as PostContentStyle)
    ? (value as PostContentStyle)
    : "market_update";
}

function normalizePosts(body: CreatePostsBody): PostInput[] {
  if (typeof body === "string") {
    const content = body.trim();
    return content ? [{ content }] : [];
  }

  if (Array.isArray(body)) {
    return body
      .map((content) => String(content).trim())
      .filter(Boolean)
      .map((content) => ({ content }));
  }

  if (Array.isArray(body.contents)) {
    return body.contents
      .map((content) => String(content).trim())
      .filter(Boolean)
      .map((content) => ({
        content,
        content_style: normalizeStyle(body.content_style),
        image_url: cleanOptionalText(body.image_url),
        coin_symbol: normalizeSymbol(body.coin_symbol),
        chart_symbol: normalizeSymbol(body.chart_symbol),
        chart_interval: cleanOptionalText(body.chart_interval),
      }));
  }

  if (Array.isArray(body.posts)) {
    return body.posts
      .map((post) => ({
        content: String(post.content ?? "").trim(),
        content_style: normalizeStyle(post.content_style),
        image_url: cleanOptionalText(post.image_url),
        coin_symbol: normalizeSymbol(post.coin_symbol),
        chart_symbol: normalizeSymbol(post.chart_symbol),
        chart_interval: cleanOptionalText(post.chart_interval),
      }))
      .filter((post) => post.content.length > 0);
  }

  if (body.content) {
    const content = body.content.trim();
    return content
      ? [
          {
            content,
            content_style: normalizeStyle(body.content_style),
            image_url: cleanOptionalText(body.image_url),
            coin_symbol: normalizeSymbol(body.coin_symbol),
            chart_symbol: normalizeSymbol(body.chart_symbol),
            chart_interval: cleanOptionalText(body.chart_interval),
          },
        ]
      : [];
  }

  return [];
}

async function getOrCreateActiveBatch() {
  const supabase = createServiceRoleClient();

  const { data: settings, error: settingsError } = await supabase
    .from("settings")
    .select("id,daily_limit,active_batch_id,cycle_count")
    .eq("id", 1)
    .single<Settings>();

  if (settingsError || !settings) {
    throw new Error(settingsError?.message ?? "Settings row not found");
  }

  if (settings.active_batch_id) {
    return settings.active_batch_id;
  }

  const batchId = crypto.randomUUID();
  const { error: updateError } = await supabase
    .from("settings")
    .update({ active_batch_id: batchId, cycle_count: 0 })
    .eq("id", 1);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return batchId;
}

export async function GET(request: NextRequest) {
  const supabase = createServiceRoleClient();
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status");
  const batchId = searchParams.get("batch_id");

  if (status && !["pending", "posted"].includes(status)) {
    return apiError("Invalid status filter", 400);
  }

  let query = supabase
    .from("posts")
    .select("*")
    .order("position", { ascending: true });

  if (status) {
    query = query.eq("status", status);
  }

  if (batchId) {
    query = query.eq("batch_id", batchId);
  }

  const { data, error } = await query.returns<Post[]>();

  if (error) {
    return apiError(error.message);
  }

  return NextResponse.json({ ok: true, posts: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = createServiceRoleClient();
  let posts: PostInput[];

  try {
    posts = normalizePosts((await request.json()) as CreatePostsBody);
  } catch {
    return apiError("Request body must be valid JSON", 400);
  }

  if (posts.length === 0) {
    return apiError("At least one post content value is required", 400);
  }

  try {
    const batchId = await getOrCreateActiveBatch();
    const { data: lastPost, error: lastPostError } = await supabase
      .from("posts")
      .select("position")
      .eq("batch_id", batchId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle<{ position: number }>();

    if (lastPostError) {
      return apiError(lastPostError.message);
    }

    const nextPosition = (lastPost?.position ?? 0) + 1;
    const rows = posts.map((post, index) => ({
      content: post.content,
      image_url: post.image_url ?? null,
      content_style: post.content_style ?? "market_update",
      coin_symbol: post.coin_symbol ?? null,
      chart_symbol: post.chart_symbol ?? null,
      chart_interval: post.chart_interval ?? null,
      batch_id: batchId,
      position: nextPosition + index,
      status: "pending",
    }));

    const { data, error } = await supabase
      .from("posts")
      .insert(rows)
      .select("*")
      .returns<Post[]>();

    if (error) {
      return apiError(error.message);
    }

    return NextResponse.json({ ok: true, posts: data ?? [] }, { status: 201 });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to create posts",
    );
  }
}
