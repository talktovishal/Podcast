import { submitUrlSchema, validateFetchableUrl } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { fromError } from "@/lib/http";
import { enqueueItem } from "@/lib/items";
import { enforceSubmitRateLimits } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const payload = submitUrlSchema.parse(await request.json());
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    enforceSubmitRateLimits(user.id, ip);

    await validateFetchableUrl(payload.url);

    const item = await enqueueItem({
      userId: user.id,
      title: payload.title,
      sourceType: "URL",
      sourceUrl: payload.url
    });
    await logger.info("URL item enqueued", {
      requestId,
      itemId: item.id,
      userId: user.id
    });

    return NextResponse.json({ ok: true, item_id: item.id, status: item.status.toLowerCase() });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/items/url"
    });
  }
}
