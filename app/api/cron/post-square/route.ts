import { NextRequest, NextResponse } from "next/server";
import { postNextScheduledToSquare } from "@/lib/posting";

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  return Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  const result = await postNextScheduledToSquare();

  return NextResponse.json(result, {
    status: result.ok ? 200 : result.status,
  });
}
