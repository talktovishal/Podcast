import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { ObjectRange, ObjectStorage, PutObjectOptions, StoredObjectHead } from "./types";

function normalizeKey(key: string): string {
  return key.replace(/^\/+/, "").replace(/\\/g, "/");
}

function assertPathContained(rootDir: string, resolvedPath: string, key: string): void {
  const normalizedRoot = resolve(rootDir) + sep;
  const normalizedResolved = resolve(resolvedPath);
  if (normalizedResolved !== resolve(rootDir) && !normalizedResolved.startsWith(normalizedRoot)) {
    throw new Error(`Storage path traversal attempt blocked: ${key}`);
  }
}

function applyRange(data: Buffer, range?: ObjectRange): Buffer {
  if (!range) {
    return data;
  }

  const start = Math.max(0, range.start);
  if (start >= data.length) {
    return Buffer.alloc(0);
  }

  if (range.end === undefined) {
    return data.subarray(start);
  }

  const end = Math.min(data.length - 1, range.end);
  if (end < start) {
    return Buffer.alloc(0);
  }

  return data.subarray(start, end + 1);
}

function inferContentType(key: string): string | undefined {
  if (key.endsWith(".mp3")) {
    return "audio/mpeg";
  }
  if (key.endsWith(".m4a")) {
    return "audio/mp4";
  }
  if (key.endsWith(".pdf")) {
    return "application/pdf";
  }
  return undefined;
}

export class LocalObjectStorage implements ObjectStorage {
  readonly backend = "local" as const;

  constructor(private readonly rootDir: string) {}

  private resolvePath(key: string): string {
    const resolved = join(this.rootDir, normalizeKey(key));
    assertPathContained(this.rootDir, resolved, key);
    return resolved;
  }

  async putObject(key: string, content: Buffer, options?: PutObjectOptions): Promise<StoredObjectHead> {
    const normalizedKey = normalizeKey(key);
    const path = this.resolvePath(normalizedKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    return {
      key: normalizedKey,
      bytes: content.byteLength,
      contentType: options?.contentType || inferContentType(normalizedKey)
    };
  }

  async getObject(key: string, range?: ObjectRange): Promise<Buffer> {
    const data = await readFile(this.resolvePath(key));
    return applyRange(data, range);
  }

  async headObject(key: string): Promise<StoredObjectHead> {
    const normalizedKey = normalizeKey(key);
    const info = await stat(this.resolvePath(normalizedKey));
    return {
      key: normalizedKey,
      bytes: info.size,
      contentType: inferContentType(normalizedKey),
      lastModified: info.mtime
    };
  }

  async deleteObject(key: string): Promise<void> {
    await rm(this.resolvePath(key), { force: true });
  }
}
