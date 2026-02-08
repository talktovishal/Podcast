import { sha256 } from "../utils/hash.js";

export type TextChunk = {
  index: number;
  text: string;
  hash: string;
};

const DEFAULT_MAX_CHARS = 1800;

function normalizeWhitespace(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function chunkText(input: string, maxChars = DEFAULT_MAX_CHARS): TextChunk[] {
  const normalized = normalizeWhitespace(input);
  if (!normalized) {
    return [];
  }

  const paragraphs = normalized.split(/\n\n+/g);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (paragraph.length <= maxChars) {
      current = paragraph;
      continue;
    }

    const sentences = paragraph.split(/(?<=[.!?])\s+/g);
    let sentenceBucket = "";
    for (const sentence of sentences) {
      const sentenceCandidate = sentenceBucket ? `${sentenceBucket} ${sentence}` : sentence;
      if (sentenceCandidate.length <= maxChars) {
        sentenceBucket = sentenceCandidate;
      } else {
        if (sentenceBucket) {
          chunks.push(sentenceBucket);
        }
        sentenceBucket = sentence;
      }
    }
    if (sentenceBucket) {
      current = sentenceBucket;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.map((text, index) => ({ index, text, hash: sha256(text) }));
}
