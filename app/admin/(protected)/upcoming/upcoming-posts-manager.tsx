"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Post, PostContentStyle } from "@/lib/database.types";

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

type ImageUploadResponse = {
  ok: true;
  imageUrl: string;
  path: string;
};

type ApiError = {
  ok: false;
  message: string;
};

type ComposerState = {
  content: string;
  imageUrl: string;
  contentStyle: PostContentStyle;
  coinSymbol: string;
  chartSymbol: string;
  chartInterval: string;
};

const initialComposer: ComposerState = {
  content: "",
  imageUrl: "",
  contentStyle: "market_update",
  coinSymbol: "",
  chartSymbol: "",
  chartInterval: "4H",
};

const styleOptions: Array<{ value: PostContentStyle; label: string }> = [
  { value: "market_update", label: "Market update" },
  { value: "news", label: "News" },
  { value: "analysis", label: "Analysis" },
  { value: "education", label: "Education" },
  { value: "question", label: "Question" },
];

const intervalOptions = ["15M", "1H", "4H", "1D", "1W"];

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
  return content.length > 180 ? `${content.slice(0, 180)}...` : content;
}

function cleanSymbol(value: string) {
  return value.trim().replace(/^\$/, "").toUpperCase();
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T | ApiError;

  if (!response.ok || isApiError(data)) {
    throw new Error(isApiError(data) ? data.message : "Request failed");
  }

  return data as T;
}

function composerPayload(composer: ComposerState) {
  const coinSymbol = cleanSymbol(composer.coinSymbol);
  const chartSymbol = cleanSymbol(composer.chartSymbol);

  return {
    content: composer.content.trim(),
    image_url: composer.imageUrl.trim() || null,
    content_style: composer.contentStyle,
    coin_symbol: coinSymbol || null,
    chart_symbol: chartSymbol || null,
    chart_interval: chartSymbol ? composer.chartInterval : null,
  };
}

export function UpcomingPostsManager() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [composer, setComposer] = useState<ComposerState>(initialComposer);
  const [bulkContent, setBulkContent] = useState("");
  const [bulkDelimiter, setBulkDelimiter] = useState("---");
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

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

  async function createPost(payload: ReturnType<typeof composerPayload>) {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      await readJson<PostsResponse>(response);
      await refreshPosts();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to create post",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleComposerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = composerPayload(composer);

    if (!payload.content) {
      setError("Post content is required");
      return;
    }

    await createPost(payload);
    setComposer(initialComposer);
  }

  async function uploadImage(file: File) {
    setError(null);
    setIsUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/uploads/image", {
        method: "POST",
        body: formData,
      });
      const data = await readJson<ImageUploadResponse>(response);
      setComposer((current) => ({
        ...current,
        imageUrl: data.imageUrl,
      }));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to upload image",
      );
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function handleBulkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const contents = splitBulkContent(bulkContent, bulkDelimiter);

    if (contents.length === 0) {
      setError("Bulk import needs at least one post");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents,
          content_style: composer.contentStyle,
          coin_symbol: cleanSymbol(composer.coinSymbol) || null,
          chart_symbol: cleanSymbol(composer.chartSymbol) || null,
          chart_interval: cleanSymbol(composer.chartSymbol)
            ? composer.chartInterval
            : null,
        }),
      });
      await readJson<PostsResponse>(response);
      setBulkContent("");
      await refreshPosts();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to import posts",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function startEditing(post: Post) {
    setEditingPostId(post.id);
    setEditingContent(post.content);
  }

  function cancelEditing() {
    setEditingPostId(null);
    setEditingContent("");
  }

  async function saveEdit(post: Post) {
    const content = editingContent.trim();

    if (!content) {
      setError("Post content cannot be empty");
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
      <form className="composer-panel" onSubmit={handleComposerSubmit}>
        <div className="composer-main">
          <div className="composer-header">
            <div>
              <h2>Square-style post</h2>
              <p>Compose the queue item in the order it should appear.</p>
            </div>
            <select
              onChange={(event) =>
                setComposer((current) => ({
                  ...current,
                  contentStyle: event.target.value as PostContentStyle,
                }))
              }
              value={composer.contentStyle}
            >
              {styleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <label>
            Post content
            <textarea
              onChange={(event) =>
                setComposer((current) => ({
                  ...current,
                  content: event.target.value,
                }))
              }
              placeholder="Start with the main idea, then add the setup, signal, or question..."
              rows={8}
              value={composer.content}
            />
          </label>

          <div className="composer-grid">
            <div className="image-upload-field">
              <span>Photo</span>
              <label className="file-upload-button">
                {isUploadingImage ? "Uploading..." : "Upload image"}
                <input
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  disabled={isUploadingImage}
                  onChange={(event) => {
                    const file = event.target.files?.[0];

                    if (file) {
                      void uploadImage(file);
                    }

                    event.target.value = "";
                  }}
                  type="file"
                />
              </label>
              {composer.imageUrl ? (
                <button
                  className="link-button"
                  onClick={() =>
                    setComposer((current) => ({ ...current, imageUrl: "" }))
                  }
                  type="button"
                >
                  Remove image
                </button>
              ) : null}
            </div>
            <label>
              Coin
              <input
                onChange={(event) =>
                  setComposer((current) => ({
                    ...current,
                    coinSymbol: event.target.value,
                  }))
                }
                placeholder="BTC"
                value={composer.coinSymbol}
              />
            </label>
            <label>
              Chart symbol
              <input
                onChange={(event) =>
                  setComposer((current) => ({
                    ...current,
                    chartSymbol: event.target.value,
                  }))
                }
                placeholder="BTCUSDT"
                value={composer.chartSymbol}
              />
            </label>
            <label>
              Chart interval
              <select
                onChange={(event) =>
                  setComposer((current) => ({
                    ...current,
                    chartInterval: event.target.value,
                  }))
                }
                value={composer.chartInterval}
              >
                {intervalOptions.map((interval) => (
                  <option key={interval} value={interval}>
                    {interval}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button disabled={isSaving} type="submit">
            Add to queue
          </button>
        </div>

        <aside className="square-preview">
          <h3>Preview</h3>
          {composer.imageUrl ? (
            <img alt="" src={composer.imageUrl} />
          ) : (
            <div className="preview-image-empty">Photo preview</div>
          )}
          <p>{composer.content || "Your post content appears here."}</p>
          <div className="metadata-row">
            {composer.coinSymbol ? <span>${cleanSymbol(composer.coinSymbol)}</span> : null}
            {composer.chartSymbol ? (
              <span>
                Chart {cleanSymbol(composer.chartSymbol)} {composer.chartInterval}
              </span>
            ) : null}
            <span>
              {styleOptions.find((option) => option.value === composer.contentStyle)
                ?.label ?? "Market update"}
            </span>
          </div>
        </aside>
      </form>

      <form className="bulk-panel" onSubmit={handleBulkSubmit}>
        <div>
          <h2>Bulk import</h2>
          <p>Uses the selected coin/chart/style from the composer above.</p>
        </div>
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
            rows={5}
            value={bulkContent}
          />
        </label>
        <button disabled={isSaving} type="submit">
          Import posts
        </button>
      </form>

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
                  <th>Post</th>
                  <th>Metadata</th>
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
                        <div className="metadata-row">
                          {post.coin_symbol ? <span>${post.coin_symbol}</span> : null}
                          {post.chart_symbol ? (
                            <span>
                              Chart {post.chart_symbol} {post.chart_interval}
                            </span>
                          ) : null}
                          {post.image_url ? <span>Photo</span> : null}
                          <span>{post.content_style.replace("_", " ")}</span>
                        </div>
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
                                onClick={() => void saveEdit(post)}
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
