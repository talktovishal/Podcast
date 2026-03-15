import { NextRequest, NextResponse } from "next/server";
import { createStripeBillingPortalSession } from "@/lib/billing";
import { requireAuthUser } from "@/lib/auth";
import { fromError } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await requireAuthUser(request);
    const url = await createStripeBillingPortalSession(user.id);
    return NextResponse.json({ ok: true, url });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/billing/portal"
    });
  }
}
