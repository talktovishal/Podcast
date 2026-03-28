import { NextRequest, NextResponse } from "next/server";
import { createStripeBillingPortalSession } from "@/lib/billing";
import { requireAuthUser } from "@/lib/auth";
import { fromError } from "@/lib/http";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await requireAuthUser(request);
    const session = await createStripeBillingPortalSession(user.id);
    await logger.info("Billing portal API succeeded", {
      request_id: requestId,
      route: "/api/billing/portal",
      userId: user.id,
      stripeCustomerId: session.customerId,
      stripePortalSessionId: session.sessionId
    });
    return NextResponse.json({ ok: true, url: session.url });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/billing/portal"
    });
  }
}
