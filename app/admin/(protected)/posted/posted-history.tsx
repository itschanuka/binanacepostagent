"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Post } from "@/lib/database.types";

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

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T | ApiError;

  if (!response.ok || isApiError(data)) {
    throw new Error(isApiError(data) ? data.message : "Request failed");
  }

  return data as T;
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 7);

  return {
    start: toDateInputValue(start),
    end: toDateInputValue(end),
  };
}

function previewContent(content: string) {
  return content.length > 140 ? `${content.slice(0, 140)}...` : content;
}

function formatPostedAt(value: string | null) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function isWithinDateRange(post: Post, startDate: string, endDate: string) {
  if (!post.posted_at) {
    return false;
  }

  const postedAt = new Date(post.posted_at).getTime();
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T23:59:59.999`).getTime();

  return postedAt >= start && postedAt <= end;
}

export function PostedHistory() {
  const defaults = useMemo(() => getDefaultDateRange(), []);
  const [posts, setPosts] = useState<Post[]>([]);
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [appliedStartDate, setAppliedStartDate] = useState(defaults.start);
  const [appliedEndDate, setAppliedEndDate] = useState(defaults.end);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const filteredPosts = useMemo(() => {
    return posts
      .filter((post) =>
        isWithinDateRange(post, appliedStartDate, appliedEndDate),
      )
      .sort((a, b) => {
        const aTime = a.posted_at ? new Date(a.posted_at).getTime() : 0;
        const bTime = b.posted_at ? new Date(b.posted_at).getTime() : 0;

        return bTime - aTime;
      });
  }, [appliedEndDate, appliedStartDate, posts]);

  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visiblePosts = filteredPosts.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  async function refreshPosts() {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/posts?status=posted", {
        cache: "no-store",
      });
      const data = await readJson<PostsResponse>(response);
      setPosts(data.posts);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to load posted history",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshPosts();
  }, []);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (new Date(startDate) > new Date(endDate)) {
      setError("Start date must be before end date");
      return;
    }

    setError(null);
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setPage(1);
  }

  function handlePageSizeChange(value: string) {
    setPageSize(Number(value));
    setPage(1);
  }

  return (
    <div className="history-layout">
      <form className="filter-panel" onSubmit={applyFilters}>
        <label>
          From
          <input
            onChange={(event) => setStartDate(event.target.value)}
            type="date"
            value={startDate}
          />
        </label>
        <label>
          To
          <input
            onChange={(event) => setEndDate(event.target.value)}
            type="date"
            value={endDate}
          />
        </label>
        <label>
          Rows
          <select
            onChange={(event) => handlePageSizeChange(event.target.value)}
            value={pageSize}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </label>
        <button disabled={isLoading} type="submit">
          Apply
        </button>
      </form>

      <div className="table-panel">
        <div className="table-header">
          <div>
            <h2>Posted history</h2>
            <p>{filteredPosts.length} posts in selected range</p>
          </div>
          <button
            className="secondary-button"
            disabled={isLoading}
            onClick={() => void refreshPosts()}
            type="button"
          >
            Refresh
          </button>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        {isLoading ? (
          <p className="empty-state">Loading posted history...</p>
        ) : visiblePosts.length === 0 ? (
          <p className="empty-state">No posted items in this date range.</p>
        ) : (
          <>
            <div className="responsive-table">
              <table>
                <thead>
                  <tr>
                    <th>Date posted</th>
                    <th>Content preview</th>
                    <th>Square link</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePosts.map((post) => (
                    <tr key={post.id}>
                      <td>{formatPostedAt(post.posted_at)}</td>
                      <td>
                        <p className="content-preview">
                          {previewContent(post.content)}
                        </p>
                      </td>
                      <td>
                        {post.square_post_url ? (
                          <a
                            className="table-link"
                            href={post.square_post_url}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Open
                          </a>
                        ) : (
                          <span className="muted-text">No link</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <button
                disabled={safePage === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                Previous
              </button>
              <span>
                Page {safePage} of {totalPages}
              </span>
              <button
                disabled={safePage === totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                type="button"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
