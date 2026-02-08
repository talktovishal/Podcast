import { rm } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
  }

  const item = await prisma.item.findUnique({ where: { id: context.params.id }, include: { episode: true } });
  if (!item || (item.userId !== user.id && user.role !== "ADMIN")) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
  }

  await prisma.item.delete({ where: { id: item.id } });

  if (item.episode?.audioPath) {
    const full = join(env.mediaRoot, item.episode.audioPath);
    await rm(full, { force: true });
  }

  if (item.sourceFilePath) {
    await rm(item.sourceFilePath, { force: true });
  }

  return NextResponse.json({ ok: true });
}
