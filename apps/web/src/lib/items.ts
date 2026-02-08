import { prisma } from "./prisma";

export async function enqueueItem(input: {
  userId: string;
  title?: string;
  sourceType: "URL" | "PDF" | "HTML_SNAPSHOT";
  sourceUrl?: string;
  sourceFilePath?: string;
  sourceHtml?: string;
  sourceCapturedAt?: Date;
}) {
  return prisma.item.create({
    data: {
      userId: input.userId,
      title: input.title,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      sourceFilePath: input.sourceFilePath,
      sourceHtml: input.sourceHtml,
      sourceCapturedAt: input.sourceCapturedAt,
      status: "QUEUED",
      jobs: {
        create: {
          status: "QUEUED"
        }
      }
    }
  });
}
