import { NextRequest, NextResponse } from "next/server";
import { applyStripeWebhookEvent, verifyStripeWebhookEvent } from "@/lib/billing";
import { fromError } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const signature = request.headers.get("stripe-signature");
    const rawBody = await request.text();
    const event = verifyStripeWebhookEvent(rawBody, signature);
    await applyStripeWebhookEvent(event);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/billing/webhook"
    });
  }
}
