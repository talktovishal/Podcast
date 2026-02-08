import { extensionConnectCodeSchema } from "@listenlater/core";
import { NextRequest, NextResponse } from "next/server";
import { createExtensionConnectCodeForUser, getAuthUserFromRequest } from "@/lib/auth";
import { fromError } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const payload = extensionConnectCodeSchema.parse(body ?? {});
    const result = await createExtensionConnectCodeForUser(user.id, payload.label);

    return NextResponse.json({
      ok: true,
      connect_code: result.connectCode,
      expires_at: result.expiresAt.toISOString()
    });
  } catch (error) {
    return fromError(error);
  }
}
