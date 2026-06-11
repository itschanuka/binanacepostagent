"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Post, PostContentStyle } from "@/lib/database.types";

type SettingsResponse = {
  ok: true;
  settings: {
    active_batch_id: string | null;
    post_interval_minutes: number;
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
  scheduledFor: string;
};

const initialComposer: ComposerState = {
  content: "",
  imageUrl: "",
  contentStyle: "market_update",
  coinSymbol: "",
  chartSymbol: "",
  chartInterval: "15m",
  scheduledFor: "",
};

const styleOptions: Array<{ value: PostContentStyle; label: string }> = [
  { value: "market_update", label: "Market update" },
  { value: "news", label: "News" },
  { value: "analysis", label: "Analysis" },
  { value: "education", label: "Education" },
  { value: "question", label: "Question" },
];

const intervalOptions = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "45m",
  "1H",
  "2H",
  "4H",
  "1D",
  "1W",
];

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

function formatDateTime(value: string | null) {
  if (!value) {
    return "Next 10-min cycle";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toDateTimeLocalValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
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
    scheduled_for: composer.scheduledFor
      ? new Date(composer.scheduledFor).toISOString()
      : null,
  };
}

export function UpcomingPostsManager() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [composer, setComposer] = useState<ComposerState>(initialComposer);
  const [bulkMeta, setBulkMeta] = useState<ComposerState>({
    ...initialComposer,
    contentStyle: "market_update",
  });
  const [postIntervalMinutes, setPostIntervalMinutes] = useState(10);
  const [bulkContent, setBulkContent] = useState("");
  const [bulkDelimiter, setBulkDelimiter] = useState("---");
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<ComposerState>(initialComposer);
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
      setPostIntervalMinutes(settingsData.settings.post_interval_minutes);

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

  async function uploadEditingImage(file: File) {
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
      setEditingPost((current) => ({
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
          image_url: bulkMeta.imageUrl || null,
          content_style: bulkMeta.contentStyle,
          coin_symbol: cleanSymbol(bulkMeta.coinSymbol) || null,
          chart_symbol: cleanSymbol(bulkMeta.chartSymbol) || null,
          chart_interval: cleanSymbol(bulkMeta.chartSymbol)
            ? bulkMeta.chartInterval
            : null,
          scheduled_for: bulkMeta.scheduledFor
            ? new Date(bulkMeta.scheduledFor).toISOString()
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
    setEditingPost({
      content: post.content,
      imageUrl: post.image_url ?? "",
      contentStyle: post.content_style,
      coinSymbol: post.coin_symbol ?? "",
      chartSymbol: post.chart_symbol ?? "",
      chartInterval: post.chart_interval ?? "15m",
      scheduledFor: post.scheduled_for
        ? toDateTimeLocalValue(new Date(post.scheduled_for))
        : "",
    });
  }

  function cancelEditing() {
    setEditingPostId(null);
    setEditingPost(initialComposer);
  }

  async function saveEdit(post: Post) {
    const payload = composerPayload(editingPost);

    if (!payload.content) {
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
        body: JSON.stringify(payload),
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

  async function postNow(post: Post) {
    if (!window.confirm("Post this queued item to Binance Square now?")) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/posts/${post.id}/post-now`, {
        method: "POST",
      });
      await readJson(response);
      await refreshPosts();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to post now",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function suggestScheduleTime() {
    const nextIndex = sortedPosts.length;
    const date = new Date();
    date.setMinutes(date.getMinutes() + nextIndex * postIntervalMinutes);
    setComposer((current) => ({
      ...current,
      scheduledFor: toDateTimeLocalValue(date),
    }));
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
            <label>
              Schedule time
              <input
                onChange={(event) =>
                  setComposer((current) => ({
                    ...current,
                    scheduledFor: event.target.value,
                  }))
                }
                type="datetime-local"
                value={composer.scheduledFor}
              />
            </label>
          </div>

          <div className="composer-actions">
            <button
              className="secondary-button"
              onClick={suggestScheduleTime}
              type="button"
            >
              Suggest time
            </button>
            <button
              className="secondary-button"
              onClick={() =>
                setComposer((current) => ({ ...current, scheduledFor: "" }))
              }
              type="button"
            >
              Use cycle
            </button>
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
              {composer.scheduledFor
                ? formatDateTime(new Date(composer.scheduledFor).toISOString())
                : "Next 10-min cycle"}
            </span>
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
          <p>Apply shared metadata to every imported post.</p>
        </div>
        <label>
          Delimiter
          <input
            onChange={(event) => setBulkDelimiter(event.target.value)}
            value={bulkDelimiter}
          />
        </label>
        <label>
          Style
          <select
            onChange={(event) =>
              setBulkMeta((current) => ({
                ...current,
                contentStyle: event.target.value as PostContentStyle,
              }))
            }
            value={bulkMeta.contentStyle}
          >
            {styleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Coin
          <input
            onChange={(event) =>
              setBulkMeta((current) => ({
                ...current,
                coinSymbol: event.target.value,
              }))
            }
            placeholder="BTC"
            value={bulkMeta.coinSymbol}
          />
        </label>
        <label>
          Chart
          <input
            onChange={(event) =>
              setBulkMeta((current) => ({
                ...current,
                chartSymbol: event.target.value,
              }))
            }
            placeholder="BTCUSDT"
            value={bulkMeta.chartSymbol}
          />
        </label>
        <label>
          Duration
          <select
            onChange={(event) =>
              setBulkMeta((current) => ({
                ...current,
                chartInterval: event.target.value,
              }))
            }
            value={bulkMeta.chartInterval}
          >
            {intervalOptions.map((interval) => (
              <option key={interval} value={interval}>
                {interval}
              </option>
            ))}
          </select>
        </label>
        <label>
          Schedule
          <input
            onChange={(event) =>
              setBulkMeta((current) => ({
                ...current,
                scheduledFor: event.target.value,
              }))
            }
            type="datetime-local"
            value={bulkMeta.scheduledFor}
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
                  <th>Timing</th>
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
                      {isEditing ? (
                        <td colSpan={3}>
                          <div className="row-edit-panel">
                            <label>
                              Content
                              <textarea
                                className="inline-editor"
                                onChange={(event) =>
                                  setEditingPost((current) => ({
                                    ...current,
                                    content: event.target.value,
                                  }))
                                }
                                rows={4}
                                value={editingPost.content}
                              />
                            </label>
                            <div className="row-edit-grid">
                              <label>
                                Style
                                <select
                                  onChange={(event) =>
                                    setEditingPost((current) => ({
                                      ...current,
                                      contentStyle: event.target
                                        .value as PostContentStyle,
                                    }))
                                  }
                                  value={editingPost.contentStyle}
                                >
                                  {styleOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                Coin
                                <input
                                  onChange={(event) =>
                                    setEditingPost((current) => ({
                                      ...current,
                                      coinSymbol: event.target.value,
                                    }))
                                  }
                                  value={editingPost.coinSymbol}
                                />
                              </label>
                              <label>
                                Chart
                                <input
                                  onChange={(event) =>
                                    setEditingPost((current) => ({
                                      ...current,
                                      chartSymbol: event.target.value,
                                    }))
                                  }
                                  value={editingPost.chartSymbol}
                                />
                              </label>
                              <label>
                                Duration
                                <select
                                  onChange={(event) =>
                                    setEditingPost((current) => ({
                                      ...current,
                                      chartInterval: event.target.value,
                                    }))
                                  }
                                  value={editingPost.chartInterval}
                                >
                                  {intervalOptions.map((interval) => (
                                    <option key={interval} value={interval}>
                                      {interval}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                Schedule
                                <input
                                  onChange={(event) =>
                                    setEditingPost((current) => ({
                                      ...current,
                                      scheduledFor: event.target.value,
                                    }))
                                  }
                                  type="datetime-local"
                                  value={editingPost.scheduledFor}
                                />
                              </label>
                            </div>
                            <div className="composer-actions">
                              <label className="file-upload-button">
                                {isUploadingImage ? "Uploading..." : "Replace photo"}
                                <input
                                  accept="image/jpeg,image/png,image/webp,image/gif"
                                  disabled={isUploadingImage}
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];

                                    if (file) {
                                      void uploadEditingImage(file);
                                    }

                                    event.target.value = "";
                                  }}
                                  type="file"
                                />
                              </label>
                              {editingPost.imageUrl ? (
                                <>
                                  <a
                                    className="action-link"
                                    href={editingPost.imageUrl}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    View photo
                                  </a>
                                  <button
                                    className="secondary-button"
                                    onClick={() =>
                                      setEditingPost((current) => ({
                                        ...current,
                                        imageUrl: "",
                                      }))
                                    }
                                    type="button"
                                  >
                                    Remove photo
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td>
                            <p className="content-preview">
                              {previewContent(post.content)}
                            </p>
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
                          <td>{formatDateTime(post.scheduled_for)}</td>
                        </>
                      )}
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
                                onClick={() => void postNow(post)}
                                type="button"
                              >
                                Post now
                              </button>
                              {post.image_url ? (
                                <a
                                  className="action-link"
                                  href={post.image_url}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  View photo
                                </a>
                              ) : null}
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
