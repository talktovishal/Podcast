import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { getArtifactStorage, isLikelyLegacyAbsolutePath, normalizeStorageKey } from "../src/lib/storage";

function inferMarkdownFromPlainText(text: string): string {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) {
    return "";
  }
  const paragraphs = cleaned
    .split(/\n{2,}/g)
    .map((value) => value.replace(/\n+/g, " ").trim())
    .filter(Boolean);
  return paragraphs.join("\n\n");
}

async function main() {
  const storage = getArtifactStorage();
  const items = await prisma.item.findMany({
    where: {
      status: "READY"
    },
    include: {
      episode: true,
      artifacts: true,
      demoExtractionTrace: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  let markdownCreated = 0;
  let rawArtifactIndexed = 0;
  let skipped = 0;

  for (const item of items) {
    const markdownExists = item.artifacts.some((artifact) => artifact.kind === "MARKDOWN");
    const rawExists = item.artifacts.some((artifact) => artifact.kind === "RAW_HTML" || artifact.kind === "RAW_PDF");

    if (!markdownExists) {
      const sourceMarkdown =
        item.demoExtractionTrace?.extractedMarkdown ||
        inferMarkdownFromPlainText(item.demoExtractionTrace?.extractedText || item.episode?.description || "");
      if (sourceMarkdown) {
        const key = normalizeStorageKey(join("items", item.id, "artifacts", "source.md"));
        const stored = await storage.putObject(key, Buffer.from(sourceMarkdown, "utf8"), {
          contentType: "text/markdown; charset=utf-8"
        });
        await prisma.itemArtifact.create({
          data: {
            itemId: item.id,
            kind: "MARKDOWN",
            storageKey: stored.key,
            contentType: "text/markdown; charset=utf-8",
            byteLength: stored.bytes
          }
        });
        markdownCreated += 1;
      } else {
        skipped += 1;
      }
    }

    if (rawExists) {
      continue;
    }

    if (item.sourceType === "PDF" && item.sourceFilePath && !isLikelyLegacyAbsolutePath(item.sourceFilePath)) {
      const head = await storage.headObject(item.sourceFilePath).catch(() => null);
      if (head) {
        await prisma.itemArtifact.create({
          data: {
            itemId: item.id,
            kind: "RAW_PDF",
            storageKey: head.key,
            contentType: head.contentType || "application/pdf",
            byteLength: head.bytes,
            expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
          }
        });
        rawArtifactIndexed += 1;
      }
    }
  }

  console.log(
    `[artifacts:backfill] markdown_created=${markdownCreated} raw_artifacts_indexed=${rawArtifactIndexed} skipped=${skipped}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

