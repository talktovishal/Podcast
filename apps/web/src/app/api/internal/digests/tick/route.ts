import { digestSchedulerTickSchema } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { fromError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization")?.trim();
  if (!header) {
    return null;
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function POST(request: NextRequest) {
  try {
    const configuredSecret = env.digestSchedulerSecret || process.env.DIGEST_SCHEDULER_SECRET || "";
    if (!configuredSecret) {
      return NextResponse.json(
        {
          ok: false,
          error_code: "INTERNAL_ERROR",
          error_message: "Digest scheduler secret is not configured."
        },
        { status: 503 }
      );
    }

    const token = bearerToken(request);
    if (!token || token !== configuredSecret) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const parsed = digestSchedulerTickSchema.parse(await request.json().catch(() => ({})));
    const tick = await prisma.digestSchedulerTick.create({
      data: {
        requestedBy: parsed.requestedBy || "scheduler",
        forceNow: parsed.forceNow
      }
    });

    return NextResponse.json({
      ok: true,
      tick_id: tick.id,
      requested_at: tick.requestedAt.toISOString(),
      force_now: tick.forceNow
    });
  } catch (error) {
    return fromError(error, {
      requestId: request.headers.get("x-request-id") || undefined,
      route: "/api/internal/digests/tick"
    });
  }
}
