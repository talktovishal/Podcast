import { headObjectIfExists, isObjectNotFound } from "@articlepod/core/src/storage/objectExists";
import { buildItemAudioStorageKey } from "@articlepod/core/src/storage/keys";
import type { ObjectStorage } from "@articlepod/core/src/storage/types";

export async function findUsableAudioCache<T extends { filePath: string }>(input: {
  find: () => Promise<T | null>;
  discardIfUnchanged: (entry: T) => Promise<boolean>;
  storage: Pick<ObjectStorage, "headObject">;
  prepare?: (entry: T) => Promise<T | null>;
}): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const entry = await input.find();
    if (!entry) {
      return null;
    }
    if (await headObjectIfExists(input.storage, entry.filePath)) {
      const prepared = input.prepare ? await input.prepare(entry) : entry;
      if (prepared) {
        return prepared;
      }
    }
    if (await input.discardIfUnchanged(entry)) {
      return null;
    }
  }
  throw new Error("Audio cache changed repeatedly during validation.");
}

export async function copyCachedAudio<T extends { filePath: string; audioBytes: number; mimeType: string }>(
  entry: T,
  itemId: string,
  publicationId: string,
  storage: Pick<ObjectStorage, "getObject" | "putObject" | "headObject">,
  beforeWrite?: () => Promise<void>
): Promise<T | null> {
  const target = buildItemAudioStorageKey(itemId, publicationId, entry.mimeType);
  let bytes: Buffer;
  try {
    bytes = await storage.getObject(entry.filePath);
  } catch (error) {
    if (isObjectNotFound(error)) {
      return null;
    }
    throw error;
  }
  if (bytes.length === 0 || bytes.length !== entry.audioBytes) {
    throw new Error("Cached audio length does not match its metadata.");
  }
  if (entry.filePath !== target) {
    await beforeWrite?.();
    const stored = await storage.putObject(target, bytes, { contentType: entry.mimeType });
    const head = await storage.headObject(target);
    if (stored.bytes !== bytes.length || head.bytes !== bytes.length) {
      throw new Error("Copied audio length does not match its source.");
    }
  }
  return { ...entry, filePath: target };
}
