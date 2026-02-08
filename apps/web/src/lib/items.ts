import { prisma } from "./prisma";

export async function enqueueItem(input: {
  userId: string;
  title?: string;
  sourceType: "URL" | "PDF";
  sourceUrl?: string;
  sourceFilePath?: string;
}) {
  return prisma.item.create({
    data: {
      userId: input.userId,
      title: input.title,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      sourceFilePath: input.sourceFilePath,
      status: "QUEUED",
      jobs: {
        create: {
          status: "QUEUED"
        }
      }
    }
  });
}
