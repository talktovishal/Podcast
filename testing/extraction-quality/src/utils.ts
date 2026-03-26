import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { REPO_ROOT } from "./paths.js";

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function writeJson(path: string, payload: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function writeText(path: string, text: string): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, text, "utf8");
}

export async function readText(path: string): Promise<string> {
  return await readFile(path, "utf8");
}

export function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function safeFileName(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export function relativeToRepo(path: string): string {
  return relative(REPO_ROOT, path) || ".";
}

export async function collectFiles(root: string, predicate: (path: string) => boolean): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentPath: string): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const nextPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(nextPath);
        continue;
      }
      if (entry.isFile() && predicate(nextPath)) {
        results.push(nextPath);
      }
    }
  }

  await walk(root);
  return results.sort();
}

export async function runWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  worker: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> {
  const safeConcurrency = Math.max(1, Math.floor(concurrency));
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index] as TInput, index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(safeConcurrency, items.length) }, () => runWorker()));
  return results;
}

export function slugFromUrl(url: string, index: number): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-");
    const path = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join("-")
      .replace(/[^a-z0-9]+/gi, "-");
    const candidate = `${host}${path ? `-${path}` : ""}`.replace(/-+/g, "-").replace(/^-|-$/g, "");
    return candidate || `url-${index + 1}`;
  } catch {
    return `url-${index + 1}`;
  }
}

export function normalizeForComparison(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function summarizeExcerpt(markdown: string, maxLength = 220): string {
  const normalized = markdown.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}
