import { NextRequest, NextResponse } from "next/server";
import { applyStripeWebhookEvent, verifyStripeWebhookEvent } from "@/lib/billing";
import { fromError } from "@/lib/http";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const signature = request.headers.get("stripe-signature");
    const rawBody = await request.text();
    const event = verifyStripeWebhookEvent(rawBody, signature, "SANDBOX");
    const result = await applyStripeWebhookEvent(event, "SANDBOX");
    const logPayload = {
      request_id: requestId,
      route: "/api/billing/webhook/sandbox",
      billingLane: "SANDBOX",
      stripeEventId: result.eventId,
      stripeEventType: result.eventType,
      stripeObjectId: result.objectId,
      stripeCustomerId: result.customerId,
      stripeSubscriptionId: result.subscriptionId,
      stripeInvoiceId: result.invoiceId,
      userId: result.userId,
      billingWebhookStatus: result.status
    };
    if (result.status === "PROCESSED") {
      await logger.info("Stripe sandbox billing webhook processed", logPayload);
    } else {
      await logger.warn("Stripe sandbox billing webhook ignored", logPayload);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/billing/webhook/sandbox"
    });
  }
}
