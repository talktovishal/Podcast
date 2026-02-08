import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getAuthUserFromRequest(request);
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
  }

  const jobs = await prisma.job.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    include: {
      item: {
        select: {
          id: true,
          title: true,
          sourceType: true,
          status: true,
          user: {
            select: {
              email: true
            }
          }
        }
      }
    }
  });

  return NextResponse.json({ ok: true, jobs });
}
