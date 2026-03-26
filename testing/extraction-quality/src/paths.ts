import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
export const EXPORT_ROOT = resolve(REPO_ROOT, "exports", "extraction-quality");
export const CORPUS_PATH = resolve(REPO_ROOT, "testing", "extraction-quality", "corpus.md");
export const ITEMS_ROOT = resolve(REPO_ROOT, "apps", "web", ".data", "media", "items");
export const DIGESTS_ROOT = resolve(REPO_ROOT, "apps", "web", ".data", "media", "digests");
