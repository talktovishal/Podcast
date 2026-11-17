import { headObjectIfExists } from "@articlepod/core/src/storage/objectExists";
import type { ObjectStorage, StoredObjectHead } from "@articlepod/core/src/storage/types";
import { deriveAlternateAudioPath } from "@articlepod/core/src/storage/keys";

export { deriveAlternateAudioPath };

export async function inspectFeedMedia(
  episodes: ReadonlyArray<{ audioPath: string; feedKind: "item" | "summary" }>,
  storage: Pick<ObjectStorage, "headObject">
): Promise<Map<string, StoredObjectHead | null>> {
  const heads = new Map<string, StoredObjectHead | null>();
  for (const episode of episodes) {
    const head = await headObjectIfExists(storage, episode.audioPath);
    heads.set(episode.audioPath, head);
    if (!head && episode.feedKind === "item") {
      const alternate = deriveAlternateAudioPath(episode.audioPath);
      if (alternate) {
        heads.set(alternate, await headObjectIfExists(storage, alternate));
      }
    }
  }
  return heads;
}
