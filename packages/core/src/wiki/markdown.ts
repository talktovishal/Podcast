type ParsedFrontmatter = Record<string, string | string[]>;

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const WIKILINK_RE = /\[\[([^[\]]+?)\]\]/g;
const MARKDOWN_LINK_RE = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;
const WIKI_SUPPORTING_SECTION_RE = /^(?:#{1,6}\s*)?(source pages?|sources?|references?)\s*:?\s*$/i;

function stripQuotes(value: string): string {
  return value.replace(/^['"]/, "").replace(/['"]$/, "").trim();
}

function parseArrayLiteral(raw: string): string[] {
  return raw
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((entry) => stripQuotes(entry.trim()))
    .filter(Boolean);
}

function normalizeSegments(segments: string[]): string[] {
  const normalized: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }
  return normalized;
}

function basename(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] || path;
}

function dirname(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments.slice(0, -1).join("/");
}

function parseWikilinkTarget(rawTarget: string): { target: string; label: string } {
  const [targetPart, labelPart] = rawTarget.split("|", 2);
  const target = targetPart.trim();
  const label = (labelPart || targetPart).trim();
  return { target, label };
}

function splitTargetAnchor(target: string): { path: string; anchor: string } {
  const [pathPart, ...anchorParts] = target.split("#");
  const anchor = anchorParts.join("#").trim();
  return {
    path: pathPart.trim(),
    anchor
  };
}

export function normalizeWikiPagePath(input: string): string {
  const normalized = normalizeSegments(input.replace(/\\/g, "/").replace(/^\/+/, "").split("/")).join("/");
  if (!normalized) {
    return "index.md";
  }
  return normalized.endsWith(".md") ? normalized : `${normalized}.md`;
}

export function wikiSlugToPagePath(slug: string[] | undefined): string {
  if (!slug || slug.length === 0) {
    return "index.md";
  }
  return normalizeWikiPagePath(slug.join("/"));
}

export function wikiPagePathToSlug(pagePath: string): string[] {
  const normalized = normalizeWikiPagePath(pagePath);
  if (normalized === "index.md") {
    return [];
  }
  return normalized
    .replace(/\.md$/, "")
    .split("/")
    .filter(Boolean);
}

export function wikiPagePathToRoutePath(pagePath: string): string {
  const slug = wikiPagePathToSlug(pagePath);
  return slug.length === 0 ? "/app/wiki" : `/app/wiki/${slug.join("/")}`;
}

export function parseSimpleFrontmatter(markdown: string): { data: ParsedFrontmatter; body: string } {
  const match = FRONTMATTER_RE.exec(markdown);
  if (!match) {
    return { data: {}, body: markdown };
  }

  const data: ParsedFrontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!value) {
      continue;
    }
    data[key] = value.startsWith("[") && value.endsWith("]") ? parseArrayLiteral(value) : stripQuotes(value);
  }

  return {
    data,
    body: markdown.slice(match[0].length)
  };
}

export function extractMarkdownTitle(body: string, fallbackPath: string): string {
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      return trimmed.slice(2).trim();
    }
  }

  const stem = basename(fallbackPath).replace(/\.md$/, "");
  return stem
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function extractMarkdownSummary(body: string): string | null {
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (
      line.startsWith("#") ||
      line.startsWith(">") ||
      line.startsWith("- ") ||
      line.startsWith("* ") ||
      line.startsWith("|") ||
      /^\d+\.\s/.test(line)
    ) {
      continue;
    }
    return line.length > 240 ? `${line.slice(0, 237).trimEnd()}...` : line;
  }

  return null;
}

export function isExternalMarkdownHref(rawHref: string): boolean {
  return /^(?:[a-z]+:)?\/\//i.test(rawHref) || /^(mailto|tel|data):/i.test(rawHref);
}

export function buildWikiPageAliasMap(pagePaths: string[]): Map<string, string> {
  const aliasMap = new Map<string, string>();
  const collisions = new Set<string>();

  const register = (alias: string, pagePath: string) => {
    const normalizedAlias = alias.trim().toLowerCase();
    if (!normalizedAlias) {
      return;
    }
    const existing = aliasMap.get(normalizedAlias);
    if (existing && existing !== pagePath) {
      collisions.add(normalizedAlias);
      return;
    }
    aliasMap.set(normalizedAlias, pagePath);
  };

  for (const pagePath of pagePaths.map((value) => normalizeWikiPagePath(value))) {
    const withoutExtension = pagePath.replace(/\.md$/, "");
    register(pagePath, pagePath);
    register(withoutExtension, pagePath);
    register(basename(pagePath), pagePath);
    register(basename(withoutExtension), pagePath);
  }

  for (const collision of collisions) {
    aliasMap.delete(collision);
  }

  return aliasMap;
}

export function resolveWikiTargetToPagePath(input: {
  target: string;
  currentPagePath: string;
  pagePaths: string[];
}): string | null {
  const { path: cleanedTarget } = splitTargetAnchor(input.target);
  if (!cleanedTarget || isExternalMarkdownHref(cleanedTarget)) {
    return null;
  }

  const aliasMap = buildWikiPageAliasMap(input.pagePaths);
  const direct = aliasMap.get(cleanedTarget.toLowerCase());
  if (direct) {
    return direct;
  }

  const normalizedDirect = normalizeWikiPagePath(cleanedTarget);
  const directNormalized = aliasMap.get(normalizedDirect.toLowerCase());
  if (directNormalized) {
    return directNormalized;
  }

  const baseDir = dirname(normalizeWikiPagePath(input.currentPagePath));
  const relativePath = normalizeWikiPagePath(`${baseDir ? `${baseDir}/` : ""}${cleanedTarget}`);
  const resolvedRelative = aliasMap.get(relativePath.toLowerCase());
  if (resolvedRelative) {
    return resolvedRelative;
  }

  return null;
}

export function extractWikiLinkTargets(markdown: string): string[] {
  const targets = new Set<string>();

  for (const match of markdown.matchAll(WIKILINK_RE)) {
    const { target } = parseWikilinkTarget(match[1] || "");
    if (target) {
      targets.add(target);
    }
  }

  for (const match of markdown.matchAll(MARKDOWN_LINK_RE)) {
    const rawHref = (match[2] || "").trim().replace(/^<|>$/g, "");
    if (!rawHref || isExternalMarkdownHref(rawHref)) {
      continue;
    }
    targets.add(rawHref);
  }

  return [...targets];
}

export function rewriteWikiLinksForApp(markdown: string, input: {
  currentPagePath: string;
  pagePaths: string[];
}): string {
  const rewriteResolvedHref = (rawTarget: string): string | null => {
    const { path, anchor } = splitTargetAnchor(rawTarget);
    const resolved = resolveWikiTargetToPagePath({
      target: path,
      currentPagePath: input.currentPagePath,
      pagePaths: input.pagePaths
    });
    if (!resolved) {
      return null;
    }
    const routePath = wikiPagePathToRoutePath(resolved);
    return anchor ? `${routePath}#${anchor}` : routePath;
  };

  const withWikilinks = markdown.replace(WIKILINK_RE, (_match, rawTarget: string) => {
    const { target, label } = parseWikilinkTarget(rawTarget);
    const href = rewriteResolvedHref(target);
    return href ? `[${label}](${href})` : label;
  });

  return withWikilinks.replace(MARKDOWN_LINK_RE, (match, label: string, rawHref: string) => {
    const cleanedHref = rawHref.trim().replace(/^<|>$/g, "");
    if (!cleanedHref || isExternalMarkdownHref(cleanedHref)) {
      return match;
    }

    const rewrittenHref = rewriteResolvedHref(cleanedHref);
    return rewrittenHref ? `[${label}](${rewrittenHref})` : match;
  });
}

export function splitWikiMarkdownForDisplay(markdown: string): {
  articleMarkdown: string;
  supportingNotes: string[];
} {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const supportingIndex = lines.findIndex((line) => WIKI_SUPPORTING_SECTION_RE.test(line.trim()));

  if (supportingIndex === -1) {
    return {
      articleMarkdown: markdown.trim(),
      supportingNotes: [],
    };
  }

  const articleMarkdown = lines
    .slice(0, supportingIndex)
    .join("\n")
    .trim();
  const supportingNotes = lines
    .slice(supportingIndex + 1)
    .join("\n")
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return {
    articleMarkdown,
    supportingNotes,
  };
}
