import { rotateFeedTokenSchema } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest, rotateDigestFeedToken } from "@/lib/auth";
import { env } from "@/lib/env";
import { fromError } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    rotateFeedTokenSchema.parse(await request.json().catch(() => ({})));
    const token = await rotateDigestFeedToken(user.id);

    return NextResponse.json({
      ok: true,
      feed_url: `${env.appUrl}/rss/digest/${token}.xml`
    });
  } catch (error) {
    return fromError(error, {
      requestId: request.headers.get("x-request-id") || undefined,
      route: "/api/digest-feed-token/rotate"
    });
  }
}
