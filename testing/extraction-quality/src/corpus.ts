import { readFile } from "node:fs/promises";
import { CORPUS_PATH } from "./paths.js";
import { type CliOptions, type CorpusEntry } from "./types.js";
import { slugFromUrl } from "./utils.js";

const REQUIRED_HEADERS = ["id", "url", "notes"] as const;

function splitRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function ensureUrl(value: string, id: string): string {
  try {
    return new URL(value).toString();
  } catch {
    throw new Error(`Invalid url '${value}' on corpus entry '${id}'`);
  }
}

function parseMarkdownCorpus(source: string): CorpusEntry[] {
  const rows = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));

  if (rows.length < 2) {
    throw new Error("Corpus Markdown input is missing its table.");
  }

  const header = splitRow(rows[0] || "");
  const separator = splitRow(rows[1] || "");
  for (const required of REQUIRED_HEADERS) {
    if (!header.includes(required)) {
      throw new Error(`Corpus Markdown input is missing required column '${required}'`);
    }
  }
  if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell))) {
    throw new Error("Corpus Markdown input has an invalid table separator row.");
  }

  const columnIndex = new Map(header.map((name, index) => [name, index]));
  const entries: CorpusEntry[] = [];

  for (const rawRow of rows.slice(2)) {
    const cells = splitRow(rawRow);
    const id = cells[columnIndex.get("id") ?? -1]?.trim() || "";
    if (!id) {
      continue;
    }
    const url = ensureUrl(cells[columnIndex.get("url") ?? -1] || "", id);
    entries.push({
      id,
      url,
      notes: cells[columnIndex.get("notes") ?? -1] || ""
    });
  }

  return entries;
}

function parseTextCorpus(source: string): CorpusEntry[] {
  const seen = new Set<string>();
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((url, index) => {
      const normalized = ensureUrl(url, `line-${index + 1}`);
      let id = slugFromUrl(normalized, index);
      while (seen.has(id)) {
        id = `${id}-${index + 1}`;
      }
      seen.add(id);
      return {
        id,
        url: normalized,
        notes: "Loaded from text corpus override."
      };
    });
}

export async function loadCorpus(inputPath?: string): Promise<CorpusEntry[]> {
  const targetPath = inputPath || CORPUS_PATH;
  const source = await readFile(targetPath, "utf8");
  return targetPath.endsWith(".txt") ? parseTextCorpus(source) : parseMarkdownCorpus(source);
}

export function filterCorpus(entries: CorpusEntry[], options: CliOptions): CorpusEntry[] {
  let next = [...entries];
  if (options.siteIds.length > 0) {
    const wanted = new Set(options.siteIds);
    next = next.filter((entry) => wanted.has(entry.id));
  }
  if (options.limit) {
    next = next.slice(0, options.limit);
  }
  return next;
}
