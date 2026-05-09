import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { fromError } from "@/lib/http";
import { webPrimaryStore, webUsesAzureTablePrimary } from "@/lib/metadata-primary-store";
import { prisma } from "@/lib/prisma";
import { getArtifactStorage } from "@/lib/storage";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const { id } = await context.params;
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const item =
      webUsesAzureTablePrimary() && webPrimaryStore
        ? await webPrimaryStore.findItemById(id)
        : await prisma.item.findUnique({
            where: { id },
            select: {
              id: true,
              userId: true,
              title: true,
              summaryTitle: true,
              summaryStatus: true,
              summaryStorageKey: true,
              summaryBytes: true,
              summaryCompletedAt: true
            }
          });

    if (!item || (item.userId !== user.id && user.role !== "ADMIN")) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
    }

    if (item.summaryStatus !== "SUCCEEDED" || !item.summaryStorageKey) {
      return NextResponse.json(
        {
          ok: false,
          error_code: "NOT_FOUND",
          error_message: "Summary is not available for this item yet."
        },
        { status: 404 }
      );
    }

    const markdown = (await getArtifactStorage().getObject(item.summaryStorageKey)).toString("utf8");
    return NextResponse.json({
      ok: true,
      item_id: item.id,
      title: item.summaryTitle || item.title || "Untitled item",
      markdown,
      bytes: item.summaryBytes ?? Buffer.byteLength(markdown, "utf8"),
      completed_at: item.summaryCompletedAt?.toISOString() ?? null
    });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/items/[id]/summary"
    });
  }
}
