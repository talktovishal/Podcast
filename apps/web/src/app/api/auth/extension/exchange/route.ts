import { extensionTokenExchangeSchema } from "@listenlater/core";
import { NextRequest, NextResponse } from "next/server";
import { exchangeExtensionConnectCode } from "@/lib/auth";
import { fromError } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    const payload = extensionTokenExchangeSchema.parse(await request.json());
    const result = await exchangeExtensionConnectCode({
      connectCode: payload.connectCode,
      label: payload.label
    });

    return NextResponse.json({
      ok: true,
      extension_token: result.token,
      expires_at: result.expiresAt.toISOString(),
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_CONNECT_CODE") {
      return NextResponse.json(
        {
          ok: false,
          error_code: "UNAUTHORIZED",
          error_message: "Connect code is invalid, expired, or already used. Generate a new one from the web app."
        },
        { status: 401 }
      );
    }

    return fromError(error);
  }
}
