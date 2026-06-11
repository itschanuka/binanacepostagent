"use client";

import { FormEvent, useEffect, useState } from "react";

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

export function SettingsPanel() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [dailyLimit, setDailyLimit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function refreshSettings() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const settingsData = await readJson<SettingsResponse>(response);
      setData(settingsData);
      setDailyLimit(String(settingsData.settings.daily_limit));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to load settings",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshSettings();
  }, []);

  async function saveDailyLimit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextDailyLimit = Number(dailyLimit);

    if (!Number.isInteger(nextDailyLimit) || nextDailyLimit < 1) {
      setError("Daily limit must be a positive integer");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ daily_limit: nextDailyLimit }),
      });
      await readJson(response);
      await refreshSettings();
      setSuccess("Daily limit updated");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to update settings",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <p className="empty-state">Loading settings...</p>;
  }

  if (!data) {
    return (
      <div className="table-panel">
        <p className="form-error">{error ?? "Settings data unavailable"}</p>
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
    <div className="settings-layout">
      <form className="tool-panel" onSubmit={saveDailyLimit}>
        <h2>Posting limit</h2>
        <label>
          Daily limit
          <input
            min={1}
            onChange={(event) => setDailyLimit(event.target.value)}
            type="number"
            value={dailyLimit}
          />
        </label>
        <button disabled={isSaving} type="submit">
          {isSaving ? "Saving..." : "Save limit"}
        </button>
      </form>

      <section className="table-panel">
        <div className="table-header">
          <div>
            <h2>Active cycle</h2>
            <p>Current batch and loop status</p>
          </div>
          <button
            className="secondary-button"
            disabled={isSaving}
            onClick={() => void refreshSettings()}
            type="button"
          >
            Refresh
          </button>
        </div>

        {error ? <p className="form-error">{error}</p> : null}
        {success ? <p className="form-success">{success}</p> : null}

        <dl className="settings-list">
          <div>
            <dt>Cycle count</dt>
            <dd>#{data.settings.cycle_count}</dd>
          </div>
          <div>
            <dt>Active batch</dt>
            <dd>{data.settings.active_batch_id ?? "Not configured"}</dd>
          </div>
          <div>
            <dt>Batch progress</dt>
            <dd>
              {data.progress.postedInActiveBatch} /{" "}
              {data.progress.totalInActiveBatch} posted
            </dd>
          </div>
          <div>
            <dt>Posting interval</dt>
            <dd>Every {data.settings.post_interval_minutes} minutes</dd>
          </div>
          <div>
            <dt>Posted today</dt>
            <dd>
              {data.progress.todaysPostCount} / {data.settings.daily_limit}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
