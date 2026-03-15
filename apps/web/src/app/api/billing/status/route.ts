import { NextRequest, NextResponse } from "next/server";
import { getBillingAccountSnapshot } from "@/lib/billing";
import { requireAuthUser } from "@/lib/auth";
import { fromError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await requireAuthUser(request);
    const billing = await getBillingAccountSnapshot(user.id);
    return NextResponse.json({ ok: true, billing });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/billing/status"
    });
  }
}
