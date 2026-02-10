import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { BRAND_NAME, buildRssXml } from "@listenlater/core";
import { env } from "../src/lib/env";
import { prisma } from "../src/lib/prisma";
import { getArtifactStorage } from "../src/lib/storage";

async function main() {
  const outputRoot = resolve(process.cwd(), "../../exports");
  const mediaRoot = join(outputRoot, "media");

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(mediaRoot, { recursive: true });

  const episodes = await prisma.episode.findMany({
    include: {
      item: {
        include: { user: true }
      }
    },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }]
  });

  const manifest: Array<{ guid: string; title: string; source_audio: string; exported_audio: string; bytes: number }> = [];
  const storage = getArtifactStorage();

  for (const episode of episodes) {
    const source = episode.audioPath;
    const exported = join(mediaRoot, `${episode.id}${episode.mimeType === "audio/mpeg" ? ".mp3" : ".m4a"}`);
    await mkdir(dirname(exported), { recursive: true });
    const audio = await storage.getObject(episode.audioPath);
    await writeFile(exported, audio);

    manifest.push({
      guid: episode.guid,
      title: episode.title,
      source_audio: source,
      exported_audio: exported,
      bytes: episode.audioBytes
    });
  }

  const rssXml = buildRssXml({
    title: `${BRAND_NAME} Export`,
    description: "Exported private feed",
    link: env.appUrl,
    feedUrl: `${env.appUrl}/exports/rss.xml`,
    language: "en-us",
    episodes: episodes.map((episode) => ({
      guid: episode.guid,
      title: episode.title,
      description: episode.description,
      pubDate: episode.publishedAt,
      enclosureUrl: `media/${episode.id}${episode.mimeType === "audio/mpeg" ? ".mp3" : ".m4a"}`,
      enclosureLength: episode.audioBytes,
      enclosureType: episode.mimeType === "audio/mpeg" ? "audio/mpeg" : "audio/mp4"
    }))
  });

  await writeFile(join(outputRoot, "rss.xml"), rssXml, "utf-8");
  await writeFile(join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

  // eslint-disable-next-line no-console
  console.log(`Export complete: ${outputRoot}`);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
