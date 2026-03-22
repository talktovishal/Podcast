import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { fromError } from "@/lib/http";
import { getSummaryRunMarkdown } from "@/lib/summaries";

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const result = await getSummaryRunMarkdown(user.id, context.params.id);
    return NextResponse.json({
      ok: true,
      title: result.title,
      markdown: result.markdown
    });
  } catch (error) {
    return fromError(error, {
      requestId: request.headers.get("x-request-id") || undefined,
      route: "/api/summary/runs/[id]/markdown"
    });
  }
}
