import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserFromRequest } from "@/lib/auth";
import { parseAdminAnalyticsFilters, parsePagination } from "@/lib/admin-analytics/filters";
import { summaryToCsv, timeseriesToCsv, usersToCsv } from "@/lib/admin-analytics/csv";
import {
  getAdminAnalyticsSummary,
  getAdminAnalyticsTimeseries,
  getAdminAnalyticsUsers
} from "@/lib/admin-analytics/service";
import { fromError } from "@/lib/http";

const datasetSchema = z.enum(["summary", "timeseries", "users"]);

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
    }

    const dataset = datasetSchema.parse(request.nextUrl.searchParams.get("dataset") || "summary");
    const filters = parseAdminAnalyticsFilters(request.nextUrl.searchParams);
    const { page, pageSize, pii } = parsePagination(request.nextUrl.searchParams);
    const generatedAt = new Date().toISOString().replace(/[:.]/g, "-");

    if (dataset === "summary") {
      const summary = await getAdminAnalyticsSummary(filters);
      const body = summaryToCsv(summary);
      return new NextResponse(body, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="admin-analytics-summary-${generatedAt}.csv"`
        }
      });
    }

    if (dataset === "timeseries") {
      const timeseries = await getAdminAnalyticsTimeseries(filters);
      const body = timeseriesToCsv(timeseries);
      return new NextResponse(body, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="admin-analytics-timeseries-${generatedAt}.csv"`
        }
      });
    }

    const users = await getAdminAnalyticsUsers({
      filters,
      page,
      pageSize,
      pii
    });
    const body = usersToCsv(users);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="admin-analytics-users-${generatedAt}.csv"`
      }
    });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/admin/analytics/export"
    });
  }
}
