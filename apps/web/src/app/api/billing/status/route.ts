import { NextRequest, NextResponse } from "next/server";
import { getBillingSettingsState } from "@/lib/billing";
import { requireAuthUser } from "@/lib/auth";
import { fromError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await requireAuthUser(request);
    const state = await getBillingSettingsState(user.id);
    const view = request.nextUrl.searchParams.get("view");
    const billing = view === "selected" ? state.selectedBilling : state.liveBilling;
    return NextResponse.json({
      ok: true,
      billing,
      mode: state.mode,
      liveBilling: state.liveBilling,
      sandboxBilling: state.sandboxBilling
    });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/billing/status"
    });
  }
}
