import { headObjectIfExists } from "@articlepod/core/src/storage/objectExists";
import type { ObjectStorage, StoredObjectHead } from "@articlepod/core/src/storage/types";
import { deriveAlternateAudioPath } from "@articlepod/core/src/storage/keys";

export { deriveAlternateAudioPath };

const PREFLIGHT_CONCURRENCY = 4;

export async function inspectFeedMedia(
  episodes: ReadonlyArray<{ audioPath: string; feedKind: "item" | "summary" }>,
  storage: Pick<ObjectStorage, "headObject">
): Promise<Map<string, StoredObjectHead | null>> {
  const entries: Array<Array<[string, StoredObjectHead | null]>> = [];
  let nextIndex = 0;
  const results = await Promise.allSettled(Array.from(
    { length: Math.min(PREFLIGHT_CONCURRENCY, episodes.length) },
    async () => {
      while (nextIndex < episodes.length) {
        const index = nextIndex++;
        const episode = episodes[index];
        const head = await headObjectIfExists(storage, episode.audioPath);
        const episodeEntries: Array<[string, StoredObjectHead | null]> = [[episode.audioPath, head]];
        if (!head && episode.feedKind === "item") {
          const alternate = deriveAlternateAudioPath(episode.audioPath);
          if (alternate) {
            episodeEntries.push([alternate, await headObjectIfExists(storage, alternate)]);
          }
        }
        entries[index] = episodeEntries;
      }
    }
  ));
  const failure = results.find((result) => result.status === "rejected");
  if (failure) {
    throw failure.reason;
  }
  return new Map(entries.flat());
}
