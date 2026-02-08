import { rm } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, getAuthUserFromRequest } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: NextRequest) {
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
  }

  const items = await prisma.item.findMany({ where: { userId: user.id }, include: { episode: true } });

  await prisma.user.delete({ where: { id: user.id } });

  for (const item of items) {
    if (item.episode?.audioPath) {
      await rm(join(env.mediaRoot, item.episode.audioPath), { force: true });
    }
    if (item.sourceFilePath) {
      await rm(item.sourceFilePath, { force: true });
    }
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
