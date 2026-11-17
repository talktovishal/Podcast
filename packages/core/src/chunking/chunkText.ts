import { sha256 } from "../utils/hash";
import { AppError, errorCodes } from "../errors/codes";

export type TextChunk = {
  index: number;
  text: string;
  hash: string;
};

const DEFAULT_MAX_CHARS = 1800;

function normalizeWhitespace(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function splitOversizedSentence(text: string, maxChars: number): string[] {
  const parts: string[] = [];
  let start = 0;
  while (text.length - start > maxChars) {
    let end = start + maxChars;
    const previous = text.charCodeAt(end - 1);
    const next = text.charCodeAt(end);
    if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
      end -= 1;
    }
    for (let boundary = end; boundary > start; boundary -= 1) {
      if (/\s/.test(text.charAt(boundary - 1))) {
        end = boundary;
        break;
      }
    }
    parts.push(text.slice(start, end));
    start = end;
  }
  parts.push(text.slice(start));
  return parts;
}

export function chunkText(input: string, maxChars = DEFAULT_MAX_CHARS): TextChunk[] {
  if (!Number.isInteger(maxChars) || maxChars < 2) {
    throw new AppError(errorCodes.INVALID_INPUT, "Chunk size must be an integer of at least 2 UTF-16 code units.");
  }
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
      if (sentence.length > maxChars) {
        for (const part of splitOversizedSentence(sentence, maxChars)) {
          if (sentenceBucket) {
            chunks.push(sentenceBucket);
          }
          sentenceBucket = part;
        }
        continue;
      }
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
