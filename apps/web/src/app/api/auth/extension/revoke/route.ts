import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest, revokeExtensionTokensForUser } from "@/lib/auth";
import { fromError } from "@/lib/http";

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const revoked = await revokeExtensionTokensForUser(user.id);
    return NextResponse.json({
      ok: true,
      revoked
    });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/auth/extension/revoke"
    });
  }
}

