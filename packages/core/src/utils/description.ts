const DEFAULT_MAX_DESCRIPTION_LENGTH = 320;
const DEFAULT_TARGET_SENTENCES = 2;
const DEFAULT_FALLBACK_DESCRIPTION = "Listen to this narrated episode in your private feed.";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripFormattingArtifacts(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+[.)]\s+/gm, "")
    .replace(/[*_~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(value: string): string[] {
  const matches = value.match(/[^.!?]+[.!?]*/g) ?? [];
  return matches
    .map((entry) => normalizeWhitespace(entry))
    .filter((entry) => entry.length > 0);
}

function truncateAtWordBoundary(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const base = value.slice(0, Math.max(0, maxLength - 3)).trimEnd();
  const boundary = base.replace(/\s+\S*$/, "").trimEnd();
  const truncated = boundary.length >= Math.floor(maxLength * 0.6) ? boundary : base;
  return `${truncated}...`;
}

export function buildEpisodeDescription(
  sourceText: string | null | undefined,
  options?: { maxLength?: number; targetSentences?: number; fallback?: string }
): string {
  const maxLength = Math.max(80, options?.maxLength ?? DEFAULT_MAX_DESCRIPTION_LENGTH);
  const targetSentences = Math.max(1, options?.targetSentences ?? DEFAULT_TARGET_SENTENCES);
  const fallback = normalizeWhitespace(options?.fallback ?? DEFAULT_FALLBACK_DESCRIPTION) || DEFAULT_FALLBACK_DESCRIPTION;
  const cleaned = stripFormattingArtifacts(sourceText ?? "");

  if (!cleaned) {
    return fallback;
  }

  const sentences = splitSentences(cleaned);
  if (sentences.length === 0) {
    return truncateAtWordBoundary(cleaned, maxLength);
  }

  let selected = "";
  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index];
    const candidate = selected ? `${selected} ${sentence}` : sentence;
    if (candidate.length > maxLength) {
      if (!selected) {
        selected = sentence;
      }
      break;
    }
    selected = candidate;
    if (index + 1 >= targetSentences) {
      break;
    }
  }

  return truncateAtWordBoundary(selected || cleaned, maxLength);
}
