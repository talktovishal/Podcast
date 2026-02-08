const METADATA_TAG_PATTERN = /<<METADATA_[^:]+:[^>]*>>/g;
const WHITESPACE_PATTERN = /[^\S\n]+/g;
const MULTIPLE_NEWLINES_PATTERN = /\n{3,}/g;
const SINGLE_NEWLINE_PATTERN = /(?<!\n)\n(?!\n)/g;

export function cleanTextWithAbogenRules(
  text: string,
  options?: { replaceSingleNewlines?: boolean }
): string {
  const replaceSingleNewlines = options?.replaceSingleNewlines ?? true;

  const withoutMetadata = text.replace(METADATA_TAG_PATTERN, "");
  const lines = withoutMetadata
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(WHITESPACE_PATTERN, " ").trim());

  let cleaned = lines.join("\n");
  cleaned = cleaned.replace(MULTIPLE_NEWLINES_PATTERN, "\n\n").trim();

  if (replaceSingleNewlines) {
    cleaned = cleaned.replace(SINGLE_NEWLINE_PATTERN, " ");
  }

  return cleaned.trim();
}
