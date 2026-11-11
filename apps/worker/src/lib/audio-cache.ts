import { headObjectIfExists } from "@articlepod/core/src/storage/objectExists";
import type { ObjectStorage } from "@articlepod/core/src/storage/types";

export async function findUsableAudioCache<T extends { filePath: string }>(input: {
  find: () => Promise<T | null>;
  discardIfUnchanged: (entry: T) => Promise<boolean>;
  storage: Pick<ObjectStorage, "headObject">;
}): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const entry = await input.find();
    if (!entry) {
      return null;
    }
    if (await headObjectIfExists(input.storage, entry.filePath)) {
      return entry;
    }
    if (await input.discardIfUnchanged(entry)) {
      return null;
    }
  }
  throw new Error("Audio cache changed repeatedly during validation.");
}
