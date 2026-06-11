"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Post } from "@/lib/database.types";

type SettingsResponse = {
  ok: true;
  settings: {
    active_batch_id: string | null;
  };
};

type PostsResponse = {
  ok: true;
  posts: Post[];
};

type ApiError = {
  ok: false;
  message: string;
};

function isApiError(response: unknown): response is ApiError {
  return (
    typeof response === "object" &&
    response !== null &&
    "ok" in response &&
    response.ok === false
  );
}

function splitBulkContent(value: string, delimiter: string) {
  const trimmedDelimiter = delimiter.trim();
  const parts = trimmedDelimiter
    ? value.split(trimmedDelimiter)
    : value.split(/\n{2,}|\r?\n/);

  return parts.map((part) => part.trim()).filter(Boolean);
}

function previewContent(content: string) {
  return content.length > 140 ? `${content.slice(0, 140)}...` : content;
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T | ApiError;

  if (!response.ok || isApiError(data)) {
    throw new Error(isApiError(data) ? data.message : "Request failed");
  }

  return data as T;
}

export function UpcomingPostsManager() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [singleContent, setSingleContent] = useState("");
  const [bulkContent, setBulkContent] = useState("");
  const [bulkDelimiter, setBulkDelimiter] = useState("---");
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const sortedPosts = useMemo(
    () => [...posts].sort((a, b) => a.position - b.position),
    [posts],
  );

  async function refreshPosts() {
    setError(null);
    setIsLoading(true);

    try {
      const settingsResponse = await fetch("/api/settings", {
        cache: "no-store",
      });
      const settingsData = await readJson<SettingsResponse>(settingsResponse);
      const batchId = settingsData.settings.active_batch_id;
      setActiveBatchId(batchId);

      const query = batchId
        ? `/api/posts?status=pending&batch_id=${encodeURIComponent(batchId)}`
        : "/api/posts?status=pending";
      const postsResponse = await fetch(query, { cache: "no-store" });
      const postsData = await readJson<PostsResponse>(postsResponse);
      setPosts(postsData.posts);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to load upcoming posts",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshPosts();
  }, []);

  async function createPosts(contents: string[]) {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contents }),
      });
      await readJson<PostsResponse>(response);
      await refreshPosts();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to create posts",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSingleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = singleContent.trim();

    if (!content) {
      setError("Post content is required");
      return;
    }

    await createPosts([content]);
    setSingleContent("");
  }

  async function handleBulkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const contents = splitBulkContent(bulkContent, bulkDelimiter);

    if (contents.length === 0) {
      setError("Bulk import needs at least one post");
      return;
    }

    await createPosts(contents);
    setBulkContent("");
  }

  function startEditing(post: Post) {
    setEditingPostId(post.id);
    setEditingContent(post.content);
  }

  function cancelEditing() {
    setEditingPostId(null);
    setEditingContent("");
  }

  async function saveEdit(postId: string) {
    const content = editingContent.trim();

    if (!content) {
      setError("Post content cannot be empty");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });
      await readJson(response);
      cancelEditing();
      await refreshPosts();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to save post",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deletePost(post: Post) {
    if (!window.confirm("Delete this queued post?")) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/posts/${post.id}`, {
        method: "DELETE",
      });
      await readJson(response);
      await refreshPosts();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to delete post",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function movePost(post: Post, direction: "up" | "down") {
    const nextPosition =
      direction === "up" ? post.position - 1 : post.position + 1;

    if (nextPosition < 1 || nextPosition > sortedPosts.length) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ position: nextPosition }),
      });
      await readJson(response);
      await refreshPosts();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to reorder post",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="queue-layout">
      <div className="queue-tools">
        <form className="tool-panel" onSubmit={handleSingleSubmit}>
          <h2>Add post</h2>
          <label>
            Content
            <textarea
              onChange={(event) => setSingleContent(event.target.value)}
              placeholder="Write the next Binance Square post..."
              rows={4}
              value={singleContent}
            />
          </label>
          <button disabled={isSaving} type="submit">
            Add post
          </button>
        </form>

        <form className="tool-panel" onSubmit={handleBulkSubmit}>
          <h2>Bulk import</h2>
          <label>
            Delimiter
            <input
              onChange={(event) => setBulkDelimiter(event.target.value)}
              value={bulkDelimiter}
            />
          </label>
          <label>
            Posts
            <textarea
              onChange={(event) => setBulkContent(event.target.value)}
              placeholder="Post one&#10;---&#10;Post two&#10;---&#10;Post three"
              rows={8}
              value={bulkContent}
            />
          </label>
          <button disabled={isSaving} type="submit">
            Import posts
          </button>
        </form>
      </div>

      <div className="table-panel">
        <div className="table-header">
          <div>
            <h2>Pending queue</h2>
            <p>
              {activeBatchId
                ? `${sortedPosts.length} pending in active batch`
                : "No active batch yet"}
            </p>
          </div>
          <button
            className="secondary-button"
            disabled={isLoading || isSaving}
            onClick={() => void refreshPosts()}
            type="button"
          >
            Refresh
          </button>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        {isLoading ? (
          <p className="empty-state">Loading upcoming posts...</p>
        ) : sortedPosts.length === 0 ? (
          <p className="empty-state">No pending posts in the active batch.</p>
        ) : (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Content preview</th>
                  <th>Order</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedPosts.map((post, index) => {
                  const isEditing = editingPostId === post.id;

                  return (
                    <tr key={post.id}>
                      <td>{post.position}</td>
                      <td>
                        {isEditing ? (
                          <textarea
                            className="inline-editor"
                            onChange={(event) =>
                              setEditingContent(event.target.value)
                            }
                            rows={4}
                            value={editingContent}
                          />
                        ) : (
                          <p className="content-preview">
                            {previewContent(post.content)}
                          </p>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            aria-label="Move post up"
                            disabled={isSaving || index === 0}
                            onClick={() => void movePost(post, "up")}
                            title="Move up"
                            type="button"
                          >
                            ^
                          </button>
                          <button
                            aria-label="Move post down"
                            disabled={
                              isSaving || index === sortedPosts.length - 1
                            }
                            onClick={() => void movePost(post, "down")}
                            title="Move down"
                            type="button"
                          >
                            v
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className="row-actions">
                          {isEditing ? (
                            <>
                              <button
                                disabled={isSaving}
                                onClick={() => void saveEdit(post.id)}
                                type="button"
                              >
                                Save
                              </button>
                              <button
                                disabled={isSaving}
                                onClick={cancelEditing}
                                type="button"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                disabled={isSaving}
                                onClick={() => startEditing(post)}
                                type="button"
                              >
                                Edit
                              </button>
                              <button
                                disabled={isSaving}
                                onClick={() => void deletePost(post)}
                                type="button"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
