import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBillingModeState, setBillingLanePreference } from "@/lib/billing";
import { requireAuthUser } from "@/lib/auth";
import { fromError } from "@/lib/http";

export const runtime = "nodejs";

const billingModeSchema = z.object({
  lane: z.enum(["LIVE", "SANDBOX"])
});

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await requireAuthUser(request);
    const mode = await getBillingModeState(user.id);
    return NextResponse.json({ ok: true, mode });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/billing/mode"
    });
  }
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await requireAuthUser(request);
    const body = billingModeSchema.parse(await request.json());
    const mode = await setBillingLanePreference(user.id, body.lane);
    return NextResponse.json({ ok: true, mode });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/billing/mode"
    });
  }
}
