import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { webPrimaryStore, webUsesAzureTablePrimary } from "@/lib/metadata-primary-store";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getAuthUserFromRequest(request);
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
  }

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const store = webPrimaryStore;
    const recentJobs = await store.listRecentJobs(50);
    const jobs = await Promise.all(
      recentJobs.map(async (job) => {
        const item = await store.findItemById(job.itemId);
        const owner = item ? await store.findUserById(item.userId) : null;
        return {
          ...job,
          item: item
            ? {
                id: item.id,
                title: item.title,
                sourceType: item.sourceType,
                status: item.status,
                user: {
                  email: owner?.email ?? null
                }
              }
            : null
        };
      })
    );

    return NextResponse.json({ ok: true, jobs });
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
