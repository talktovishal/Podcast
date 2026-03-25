import { readFile } from "node:fs/promises";
import { CORPUS_PATH } from "./paths.js";
import {
  cohortValues,
  expectedOutcomeValues,
  pathModeValues,
  type CliOptions,
  type CorpusEntry
} from "./types.js";

const REQUIRED_HEADERS = [
  "id",
  "cohort",
  "site",
  "url",
  "path_mode",
  "expected_url",
  "expected_extension",
  "requires_manual",
  "notes"
] as const;

function splitRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseBoolean(input: string, field: string, id: string): boolean {
  const normalized = input.trim().toLowerCase();
  if (normalized === "yes" || normalized === "true") {
    return true;
  }
  if (normalized === "no" || normalized === "false") {
    return false;
  }
  throw new Error(`Invalid boolean '${input}' for ${field} on corpus entry '${id}'`);
}

function assertIncludes<T extends readonly string[]>(values: T, input: string, field: string, id: string): T[number] {
  if (!(values as readonly string[]).includes(input)) {
    throw new Error(`Invalid ${field} '${input}' on corpus entry '${id}'`);
  }
  return input as T[number];
}

export async function loadCorpus(): Promise<CorpusEntry[]> {
  const source = await readFile(CORPUS_PATH, "utf8");
  const rows = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));

  if (rows.length < 2) {
    throw new Error("corpus.md is missing its Markdown table.");
  }

  const header = splitRow(rows[0] || "");
  const separator = splitRow(rows[1] || "");

  for (const required of REQUIRED_HEADERS) {
    if (!header.includes(required)) {
      throw new Error(`corpus.md is missing required column '${required}'`);
    }
  }
  if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell))) {
    throw new Error("corpus.md has an invalid table separator row.");
  }

  const columnIndex = new Map(header.map((name, index) => [name, index]));
  const entries: CorpusEntry[] = [];

  for (const rawRow of rows.slice(2)) {
    const cells = splitRow(rawRow);
    const id = cells[columnIndex.get("id") ?? -1]?.trim() || "";
    if (!id) {
      continue;
    }

    const entry: CorpusEntry = {
      id,
      cohort: assertIncludes(cohortValues, cells[columnIndex.get("cohort") ?? -1] || "", "cohort", id),
      site: cells[columnIndex.get("site") ?? -1] || "",
      url: cells[columnIndex.get("url") ?? -1] || "",
      pathMode: assertIncludes(pathModeValues, cells[columnIndex.get("path_mode") ?? -1] || "", "path_mode", id),
      expectedUrl: assertIncludes(
        expectedOutcomeValues,
        cells[columnIndex.get("expected_url") ?? -1] || "",
        "expected_url",
        id
      ),
      expectedExtension: assertIncludes(
        expectedOutcomeValues,
        cells[columnIndex.get("expected_extension") ?? -1] || "",
        "expected_extension",
        id
      ),
      requiresManual: parseBoolean(cells[columnIndex.get("requires_manual") ?? -1] || "", "requires_manual", id),
      notes: cells[columnIndex.get("notes") ?? -1] || ""
    };

    try {
      new URL(entry.url);
    } catch {
      throw new Error(`Invalid url '${entry.url}' on corpus entry '${entry.id}'`);
    }

    entries.push(entry);
  }

  return entries;
}

export function filterCorpus(entries: CorpusEntry[], options: CliOptions): CorpusEntry[] {
  let next = [...entries];

  if (options.siteIds.length > 0) {
    const wanted = new Set(options.siteIds);
    next = next.filter((entry) => wanted.has(entry.id));
  }

  if (options.cohort) {
    next = next.filter((entry) => entry.cohort === options.cohort);
  }

  if (options.limit) {
    next = next.slice(0, options.limit);
  }

  return next;
}

export function shouldRunUrl(entry: CorpusEntry): boolean {
  return entry.pathMode === "url_only" || entry.pathMode === "both" || entry.pathMode === "extension_primary";
}

export function shouldRunExtension(entry: CorpusEntry): boolean {
  return entry.pathMode === "extension_only" || entry.pathMode === "both" || entry.pathMode === "extension_primary";
}
