"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SettingsResponse = {
  ok: true;
  settings: {
    daily_limit: number;
    active_batch_id: string | null;
    cycle_count: number;
    post_interval_minutes: number;
  };
  progress: {
    postedInActiveBatch: number;
    totalInActiveBatch: number;
    todaysPostCount: number;
  };
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

export function DashboardMetrics() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const batchPercent = useMemo(() => {
    if (!data || data.progress.totalInActiveBatch === 0) {
      return 0;
    }

    return Math.round(
      (data.progress.postedInActiveBatch / data.progress.totalInActiveBatch) *
        100,
    );
  }, [data]);

  async function refreshSettings() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const settingsData = await readJson<SettingsResponse>(response);
      setData(settingsData);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to load dashboard",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshSettings();
  }, []);

  if (isLoading) {
    return <p className="empty-state">Loading dashboard...</p>;
  }

  if (error || !data) {
    return (
      <div className="table-panel">
        <p className="form-error">{error ?? "Dashboard data unavailable"}</p>
        <button
          className="secondary-button"
          onClick={() => void refreshSettings()}
          type="button"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <div className="metric-grid">
        <section className="metric-card">
          <p>Today</p>
          <strong>
            {data.progress.todaysPostCount} / {data.settings.daily_limit}
          </strong>
        </section>
        <section className="metric-card">
          <p>Active batch</p>
          <strong>
            {data.progress.postedInActiveBatch} /{" "}
            {data.progress.totalInActiveBatch}
          </strong>
        </section>
        <section className="metric-card">
          <p>Cycle</p>
          <strong>#{data.settings.cycle_count}</strong>
        </section>
      </div>

      <section className="table-panel">
        <div className="table-header">
          <div>
            <h2>Batch progress</h2>
            <p>
              {data.settings.active_batch_id
                ? `${batchPercent}% complete in the active batch`
                : "No active batch configured"}
            </p>
          </div>
          <button
            className="secondary-button"
            onClick={() => void refreshSettings()}
            type="button"
          >
            Refresh
          </button>
        </div>
        <div
          aria-label="Active batch progress"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={batchPercent}
          className="progress-track"
          role="progressbar"
        >
          <span style={{ width: `${batchPercent}%` }} />
        </div>
      </section>

      <nav aria-label="Quick links" className="quick-links">
        <Link href="/admin/upcoming">Upcoming posts</Link>
        <Link href="/admin/posted">Posted history</Link>
        <Link href="/admin/settings">Settings</Link>
      </nav>
    </div>
  );
}
