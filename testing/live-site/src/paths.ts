import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const LIVE_SITE_ROOT = resolve(here, "..");
export const REPO_ROOT = resolve(LIVE_SITE_ROOT, "../..");
export const CORPUS_PATH = resolve(LIVE_SITE_ROOT, "corpus.md");
export const QUIRKS_PATH = resolve(LIVE_SITE_ROOT, "quirks.md");
export const EXPORT_ROOT = resolve(REPO_ROOT, "exports", "live-site-validation");
export const EXTENSION_ROOT = resolve(REPO_ROOT, "apps", "extension");
export const EXTENSION_PACKAGE_ROOT = resolve(REPO_ROOT, "dist", "extension", "package");
export const EXTENSION_MANIFEST_PATH = resolve(EXTENSION_ROOT, "manifest.json");
export const VERIFY_PODCAST_CONTRACT_PATH = resolve(REPO_ROOT, "scripts", "verify_podcast_contract.sh");
export const PARITY_UP_PATH = resolve(REPO_ROOT, "scripts", "parity-up.sh");
export const PARITY_DOWN_PATH = resolve(REPO_ROOT, "scripts", "parity-down.sh");
export const PROBE_WORKFLOW_PATH = ".github/workflows/probe-url-extraction.yml";
