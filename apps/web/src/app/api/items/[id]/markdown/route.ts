import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { fromError } from "@/lib/http";
import {
  webPrimaryStore,
  webUsesAzureTablePrimary,
} from "@/lib/metadata-primary-store";
import { prisma } from "@/lib/prisma";
import { getArtifactStorage } from "@/lib/storage";

export async function GET(
  request: NextRequest,
  context: { params: { id: string } },
) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error_code: "UNAUTHORIZED",
          error_message: "Unauthorized",
        },
        { status: 401 },
      );
    }

    const item =
      webUsesAzureTablePrimary() && webPrimaryStore
        ? await (async () => {
            const [itemRow, artifacts] = await Promise.all([
              webPrimaryStore.findItemById(context.params.id),
              webPrimaryStore.listItemArtifacts(context.params.id, "MARKDOWN"),
            ]);
            return itemRow
              ? {
                  ...itemRow,
                  artifacts,
                }
              : null;
          })()
        : await prisma.item.findUnique({
            where: { id: context.params.id },
            include: {
              artifacts: {
                where: { kind: "MARKDOWN" },
                take: 1,
              },
            },
          });
    if (!item || (item.userId !== user.id && user.role !== "ADMIN")) {
      return NextResponse.json(
        {
          ok: false,
          error_code: "UNAUTHORIZED",
          error_message: "Unauthorized",
        },
        { status: 403 },
      );
    }

    const markdownArtifact = item.artifacts[0];
    if (!markdownArtifact) {
      return NextResponse.json(
        {
          ok: false,
          error_code: "NOT_FOUND",
          error_message:
            "Markdown artifact is not available for this item yet.",
        },
        { status: 404 },
      );
    }

    const markdown = (
      await getArtifactStorage().getObject(markdownArtifact.storageKey)
    ).toString("utf8");
    if (request.nextUrl.searchParams.get("download") === "1") {
      const filename = `${
        (item.title || "article")
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 80) || "article"
      }.md`;
      return new NextResponse(markdown, {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      item_id: item.id,
      markdown,
      bytes: markdownArtifact.byteLength,
    });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/items/[id]/markdown",
    });
  }
}
