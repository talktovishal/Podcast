import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createStripeCheckoutSession, type SelfServeBillingPlanCode } from "@/lib/billing";
import { requireAuthUser } from "@/lib/auth";
import { fromError } from "@/lib/http";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const checkoutSchema = z.object({
  planCode: z.enum(["PRO_MONTHLY", "PRO_ANNUAL"]).default("PRO_MONTHLY")
});

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await requireAuthUser(request);
    const body = checkoutSchema.parse(await request.json().catch(() => ({ planCode: "PRO_MONTHLY" })));
    const session = await createStripeCheckoutSession({
      userId: user.id,
      planCode: body.planCode as SelfServeBillingPlanCode
    });
    await logger.info("Billing checkout API succeeded", {
      request_id: requestId,
      route: "/api/billing/checkout",
      userId: user.id,
      planCode: body.planCode,
      stripeCustomerId: session.customerId,
      stripeSessionId: session.sessionId
    });
    return NextResponse.json({ ok: true, url: session.url });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/billing/checkout"
    });
  }
}
