import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
  }

  const item = await prisma.item.findUnique({ where: { id: context.params.id } });
  if (!item || (item.userId !== user.id && user.role !== "ADMIN")) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.item.update({ where: { id: item.id }, data: { status: "QUEUED", errorCode: null, errorMessage: null } });
    await tx.job.create({ data: { itemId: item.id, status: "QUEUED" } });
  });

  return NextResponse.json({ ok: true });
}
