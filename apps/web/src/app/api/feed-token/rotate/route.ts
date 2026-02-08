import { rotateFeedTokenSchema } from "@listenlater/core";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest, rotateFeedToken } from "@/lib/auth";
import { env } from "@/lib/env";
import { fromError } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    rotateFeedTokenSchema.parse(await request.json().catch(() => ({})));
    const token = await rotateFeedToken(user.id);

    return NextResponse.json({
      ok: true,
      feed_url: `${env.appUrl}/rss/${token}.xml`
    });
  } catch (error) {
    return fromError(error);
  }
}
