import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    if (env.metadataPrimaryBackend !== "azure_table") {
      await prisma.$queryRaw`SELECT 1`;
    }
    return NextResponse.json({
      ok: true,
      profile: env.runtimeProfile,
      storageBackend: env.storageBackend,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "health check failed"
      },
      { status: 503 }
    );
  }
}
