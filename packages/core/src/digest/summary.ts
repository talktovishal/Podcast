import { AppError, errorCodes } from "../errors/codes";
import type { DigestCadence, DigestLengthMinutes } from "../types/domain";

export type DigestSummarySource = {
  itemId: string;
  title: string | null;
  sourceType: "URL" | "PDF" | "HTML_SNAPSHOT";
  sourceUrl: string | null;
  createdAt: Date;
  markdown: string;
};

export type DigestSummaryRequest = {
  cadence: DigestCadence;
  timezone: string;
  periodKey: string;
  windowStart: Date;
  windowEnd: Date;
  targetLengthMinutes: DigestLengthMinutes;
  targetWords: number;
  sources: DigestSummarySource[];
};

export type DigestSummaryResponse = {
  title: string;
  markdown: string;
  plainText: string;
  provider: string;
  model: string;
};

export interface SummaryProvider {
  summarize(input: DigestSummaryRequest): Promise<DigestSummaryResponse>;
}

function normalizeSnippet(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+[.)]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownToPlainText(markdown: string): string {
  return normalizeSnippet(markdown);
}

function cadenceLabel(cadence: DigestCadence): string {
  return cadence === "DAILY" ? "Daily" : "Weekly";
}

function sourceLabel(sourceType: DigestSummarySource["sourceType"]): string {
  switch (sourceType) {
    case "URL":
      return "URL";
    case "PDF":
      return "PDF";
    case "HTML_SNAPSHOT":
      return "Chrome extension";
    default:
      return sourceType;
  }
}

function stableSourceSort(a: DigestSummarySource, b: DigestSummarySource): number {
  const dateDiff = b.createdAt.getTime() - a.createdAt.getTime();
  if (dateDiff !== 0) {
    return dateDiff;
  }
  return a.itemId.localeCompare(b.itemId);
}

export class StubSummaryProvider implements SummaryProvider {
  async summarize(input: DigestSummaryRequest): Promise<DigestSummaryResponse> {
    const sorted = [...input.sources].sort(stableSourceSort);
    const maxChars = Math.max(800, input.targetWords * 6);
    const lines: string[] = [];

    for (const source of sorted) {
      const normalizedTitle = source.title?.trim() || "Untitled";
      const snippet = normalizeSnippet(source.markdown).slice(0, 240);
      if (!snippet) {
        continue;
      }

      const line = `- [${sourceLabel(source.sourceType)}] ${normalizedTitle}: ${snippet}`;
      if (lines.join("\n").length + line.length > maxChars) {
        break;
      }
      lines.push(line);
    }

    const title = `${cadenceLabel(input.cadence)} Digest - ${input.periodKey}`;
    const heading = `# ${title}`;
    const intro = `Generated from ${sorted.length} source item(s), target length ${input.targetLengthMinutes} minutes (${input.targetWords} words).`;
    const markdown = [heading, "", intro, "", "## Key updates", "", ...(lines.length > 0 ? lines : ["- No source summaries found."])].join(
      "\n"
    );

    return {
      title,
      markdown,
      plainText: markdownToPlainText(markdown),
      provider: "stub",
      model: "stub-deterministic-v1"
    };
  }
}

export class ProxySummaryProvider implements SummaryProvider {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly providerLabel: string;

  constructor(input: { baseUrl: string; timeoutMs?: number; providerLabel?: string }) {
    this.baseUrl = input.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = input.timeoutMs ?? 30_000;
    this.providerLabel = input.providerLabel ?? "proxy";
  }

  async summarize(input: DigestSummaryRequest): Promise<DigestSummaryResponse> {
    const response = await fetch(`${this.baseUrl}/v1/digest/summarize`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify(input)
    }).catch((error) => {
      throw new AppError(
        errorCodes.EXTRACTION_FAILED,
        error instanceof Error ? error.message : "Digest summary provider request failed.",
        502
      );
    });

    if (!response.ok) {
      throw new AppError(errorCodes.EXTRACTION_FAILED, `Digest summary provider returned ${response.status}.`, 502);
    }

    const parsed = (await response.json()) as Partial<DigestSummaryResponse>;
    const title = parsed.title?.trim() || `${cadenceLabel(input.cadence)} Digest - ${input.periodKey}`;
    const markdown = parsed.markdown?.trim() || "";
    if (!markdown) {
      throw new AppError(errorCodes.EXTRACTION_EMPTY, "Digest summary provider returned empty content.", 502);
    }

    return {
      title,
      markdown,
      plainText: parsed.plainText?.trim() || markdownToPlainText(markdown),
      provider: parsed.provider?.trim() || this.providerLabel,
      model: parsed.model?.trim() || "proxy"
    };
  }
}
