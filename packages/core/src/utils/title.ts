const MAX_TITLE_LENGTH = 120;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateTitle(value: string): string {
  if (value.length <= MAX_TITLE_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_TITLE_LENGTH - 3).trimEnd()}...`;
}

function isPlaceholderTitle(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized === "untitled" || normalized === "uploaded pdf";
}

function inferTitleFromText(text: string): string {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return "Untitled episode";
  }

  const sentence = normalized.match(/(.{1,220}?[.!?])(?:\s|$)/)?.[1] ?? normalized.slice(0, 220);
  const cleaned = sentence.replace(/[.!?]+$/, "").trim();
  return truncateTitle(cleaned || "Untitled episode");
}

export function resolveEpisodeTitle(extractedTitle: string | null | undefined, text: string): string {
  const candidate = normalizeWhitespace(extractedTitle ?? "");
  if (candidate && !isPlaceholderTitle(candidate)) {
    return truncateTitle(candidate);
  }

  return inferTitleFromText(text);
}
