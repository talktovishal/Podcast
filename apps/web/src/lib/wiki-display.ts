const WIKI_SUPPORTING_SECTION_RE = /^(?:#{1,6}\s*)?(source pages?|sources?|references?)\s*:?\s*$/i;

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
