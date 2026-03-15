import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createStripeCheckoutSession, type BillingPlanCode } from "@/lib/billing";
import { requireAuthUser } from "@/lib/auth";
import { fromError } from "@/lib/http";

export const runtime = "nodejs";

const checkoutSchema = z.object({
  planCode: z.enum(["PRO_MONTHLY"]).default("PRO_MONTHLY")
});

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await requireAuthUser(request);
    const body = checkoutSchema.parse(await request.json().catch(() => ({ planCode: "PRO_MONTHLY" })));
    const url = await createStripeCheckoutSession({
      userId: user.id,
      planCode: body.planCode as BillingPlanCode
    });
    return NextResponse.json({ ok: true, url });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/billing/checkout"
    });
  }
}
