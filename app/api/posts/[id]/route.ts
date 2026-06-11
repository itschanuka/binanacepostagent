import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import type { Post } from "@/lib/database.types";
import { createServiceRoleClient } from "@/lib/supabase/server";

type RouteContext = {
  params: {
    id: string;
  };
};

type PatchPostBody = {
  content?: unknown;
  position?: unknown;
};

const POSITION_OFFSET = 1_000_000;

function parsePosition(value: unknown) {
  if (value === undefined) {
    return null;
  }

  const position = Number(value);

  if (!Number.isInteger(position) || position < 1) {
    throw new Error("Position must be a positive integer");
  }

  return position;
}

async function moveBatchToTemporaryPositions(posts: Pick<Post, "id" | "position">[]) {
  const supabase = createServiceRoleClient();

  for (const post of posts) {
    const { error } = await supabase
      .from("posts")
      .update({ position: post.position + POSITION_OFFSET })
      .eq("id", post.id);

    if (error) {
      throw new Error(error.message);
    }
  }
}

async function writeFinalPositions(
  posts: Pick<Post, "id">[],
  contentUpdate?: { id: string; content: string },
) {
  const supabase = createServiceRoleClient();

  for (let index = 0; index < posts.length; index += 1) {
    const post = posts[index];
    const updateValues: {
      position: number;
      content?: string;
    } = {
      position: index + 1,
    };

    if (contentUpdate?.id === post.id) {
      updateValues.content = contentUpdate.content;
    }

    const { error } = await supabase
      .from("posts")
      .update(updateValues)
      .eq("id", post.id);

    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const supabase = createServiceRoleClient();
  let body: PatchPostBody;

  try {
    body = (await request.json()) as PatchPostBody;
  } catch {
    return apiError("Request body must be valid JSON", 400);
  }

  const content =
    body.content === undefined ? null : String(body.content).trim();

  if (content !== null && content.length === 0) {
    return apiError("Content cannot be empty", 400);
  }

  let requestedPosition: number | null;

  try {
    requestedPosition = parsePosition(body.position);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Invalid position",
      400,
    );
  }

  const { data: existingPost, error: existingError } = await supabase
    .from("posts")
    .select("*")
    .eq("id", params.id)
    .maybeSingle<Post>();

  if (existingError) {
    return apiError(existingError.message);
  }

  if (!existingPost) {
    return apiError("Post not found", 404);
  }

  try {
    if (requestedPosition === null) {
      if (content === null) {
        return NextResponse.json({ ok: true, post: existingPost });
      }

      const { data, error } = await supabase
        .from("posts")
        .update({ content })
        .eq("id", params.id)
        .select("*")
        .single<Post>();

      if (error) {
        return apiError(error.message);
      }

      return NextResponse.json({ ok: true, post: data });
    }

    const { data: batchPosts, error: batchError } = await supabase
      .from("posts")
      .select("*")
      .eq("batch_id", existingPost.batch_id)
      .order("position", { ascending: true })
      .returns<Post[]>();

    if (batchError) {
      return apiError(batchError.message);
    }

    const posts = batchPosts ?? [];
    const targetIndex = Math.min(requestedPosition, posts.length) - 1;
    const withoutCurrent = posts.filter((post) => post.id !== params.id);
    const currentPost = posts.find((post) => post.id === params.id);

    if (!currentPost) {
      return apiError("Post not found", 404);
    }

    withoutCurrent.splice(targetIndex, 0, currentPost);

    await moveBatchToTemporaryPositions(posts);
    await writeFinalPositions(
      withoutCurrent,
      content === null ? undefined : { id: params.id, content },
    );

    const { data: updatedPost, error: updatedError } = await supabase
      .from("posts")
      .select("*")
      .eq("id", params.id)
      .single<Post>();

    if (updatedError) {
      return apiError(updatedError.message);
    }

    return NextResponse.json({ ok: true, post: updatedPost });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to update post",
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const supabase = createServiceRoleClient();

  const { data: existingPost, error: existingError } = await supabase
    .from("posts")
    .select("*")
    .eq("id", params.id)
    .maybeSingle<Post>();

  if (existingError) {
    return apiError(existingError.message);
  }

  if (!existingPost) {
    return apiError("Post not found", 404);
  }

  const { error: deleteError } = await supabase
    .from("posts")
    .delete()
    .eq("id", params.id);

  if (deleteError) {
    return apiError(deleteError.message);
  }

  const { data: remainingPosts, error: remainingError } = await supabase
    .from("posts")
    .select("id,position")
    .eq("batch_id", existingPost.batch_id)
    .order("position", { ascending: true })
    .returns<Pick<Post, "id" | "position">[]>();

  if (remainingError) {
    return apiError(remainingError.message);
  }

  try {
    const posts = remainingPosts ?? [];
    await moveBatchToTemporaryPositions(posts);
    await writeFinalPositions(posts);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to resequence posts",
    );
  }

  return NextResponse.json({ ok: true, deletedId: params.id });
}
