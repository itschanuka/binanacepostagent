import { NextRequest, NextResponse } from "next/server";
import { postSinglePostToSquare } from "@/lib/posting";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const result = await postSinglePostToSquare(params.id);

  return NextResponse.json(result, {
    status: result.ok ? 200 : result.status,
  });
}
