import { NextResponse } from "next/server";

export type ApiError = {
  ok: false;
  message: string;
};

export function apiError(message: string, status = 500) {
  return NextResponse.json<ApiError>({ ok: false, message }, { status });
}

export function getUtcDayRange() {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}
