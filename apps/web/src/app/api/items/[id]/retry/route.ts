import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { webPrimaryStore, webUsesAzureTablePrimary } from "@/lib/metadata-primary-store";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
  }

  const item =
    webUsesAzureTablePrimary() && webPrimaryStore
      ? await webPrimaryStore.findItemById(context.params.id)
      : await prisma.item.findUnique({ where: { id: context.params.id } });
  if (!item || (item.userId !== user.id && user.role !== "ADMIN")) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
  }

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    await webPrimaryStore.updateItem(item.id, {
      status: "QUEUED",
      errorCode: null,
      errorMessage: null
    });
    await webPrimaryStore.createJob({
      id: randomUUID(),
      itemId: item.id,
      userId: item.userId,
      status: "QUEUED"
    });
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.item.update({ where: { id: item.id }, data: { status: "QUEUED", errorCode: null, errorMessage: null } });
      await tx.job.create({ data: { itemId: item.id, status: "QUEUED" } });
    });
  }

  return NextResponse.json({ ok: true });
}
