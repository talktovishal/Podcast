import { createSummaryRunSchema } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { fromError } from "@/lib/http";
import { createSummaryRunForUser, listSummaryRunsForUser } from "@/lib/summaries";

function parseLimit(request: NextRequest): number {
  const raw = request.nextUrl.searchParams.get("limit");
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20;
  }
  return Math.min(parsed, 50);
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const runs = await listSummaryRunsForUser(user.id, parseLimit(request));
    return NextResponse.json({
      ok: true,
      runs
    });
  } catch (error) {
    return fromError(error, {
      requestId: request.headers.get("x-request-id") || undefined,
      route: "/api/summary/runs"
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const payload = createSummaryRunSchema.parse(await request.json());
    const run = await createSummaryRunForUser(user.id, payload);
    return NextResponse.json({
      ok: true,
      run
    });
  } catch (error) {
    return fromError(error, {
      requestId: request.headers.get("x-request-id") || undefined,
      route: "/api/summary/runs"
    });
  }
}
