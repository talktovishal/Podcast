import type { ObjectStorage, StoredObjectHead } from "./types";

export function isObjectNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  if ("code" in error && error.code === "ENOENT") {
    return true;
  }
  return "statusCode" in error && error.statusCode === 404 && "code" in error && error.code === "BlobNotFound";
}

export async function headObjectIfExists(
  storage: Pick<ObjectStorage, "headObject">,
  key: string
): Promise<StoredObjectHead | null> {
  try {
    return await storage.headObject(key);
  } catch (error) {
    if (isObjectNotFound(error)) {
      return null;
    }
    throw error;
  }
}
