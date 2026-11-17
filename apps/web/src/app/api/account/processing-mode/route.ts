import { updateItemProcessingModeSchema } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { fromError } from "@/lib/http";
import { findPrimaryUserById, updatePrimaryUser } from "@/lib/metadata-primary-auth";

function normalizeMode(mode: string | null | undefined): "FULL_EPISODE" | "SUMMARY_ONLY" {
  return mode === "SUMMARY_ONLY" ? "SUMMARY_ONLY" : "FULL_EPISODE";
}

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const record = await findPrimaryUserById(user.id);
    return NextResponse.json({
      ok: true,
      mode: normalizeMode(record?.defaultItemProcessingMode)
    });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/account/processing-mode"
    });
  }
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const payload = updateItemProcessingModeSchema.parse(await request.json());
    const updated = await updatePrimaryUser(user.id, {
      defaultItemProcessingMode: payload.mode
    });

    return NextResponse.json({
      ok: true,
      mode: normalizeMode(updated?.defaultItemProcessingMode)
    });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/account/processing-mode"
    });
  }
}
