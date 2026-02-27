import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { parseAdminAnalyticsFilters, parsePagination } from "@/lib/admin-analytics/filters";
import { getAdminAnalyticsUsers } from "@/lib/admin-analytics/service";
import { fromError } from "@/lib/http";

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
    }

    const filters = parseAdminAnalyticsFilters(request.nextUrl.searchParams);
    const pagination = parsePagination(request.nextUrl.searchParams);
    const users = await getAdminAnalyticsUsers({
      filters,
      page: pagination.page,
      pageSize: pagination.pageSize,
      pii: pagination.pii
    });

    return NextResponse.json({ ok: true, users });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/admin/analytics/users"
    });
  }
}
