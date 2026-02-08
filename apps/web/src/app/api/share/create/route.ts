import { NextRequest, NextResponse } from "next/server";
import { createShareToken, getAuthUserFromRequest } from "@/lib/auth";
import { env } from "@/lib/env";

export async function POST(request: NextRequest) {
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
  }

  const token = await createShareToken(user.id, new Date(Date.now() + 1000 * 60 * 60 * 24 * 7));
  return NextResponse.json({
    ok: true,
    share_url: `${env.appUrl}/share?token=${token}`
  });
}
