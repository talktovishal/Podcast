#!/usr/bin/env tsx

import { AppError, extractHtmlFromUrlWithDiagnostics, getHtmlFetchDiagnostics, validateFetchableUrl } from "@articlepod/core";

function getHost(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return "";
  }
}

function printJson(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

const targetUrl = process.argv[2]?.trim();
if (!targetUrl) {
  process.stderr.write("Usage: npx tsx scripts/azure/probe-url-extract.ts \"<URL>\"\n");
  process.exit(2);
}

const startedAt = Date.now();
const targetHost = getHost(targetUrl);

async function main(): Promise<void> {
  try {
    const validated = await validateFetchableUrl(targetUrl);
    const pinnedCandidates = validated.resolvedIps.length > 0 ? validated.resolvedIps : [validated.resolvedIp];
    const extraction = await extractHtmlFromUrlWithDiagnostics(targetUrl, pinnedCandidates);

    printJson({
      ok: true,
      url: targetUrl,
      host: targetHost,
      duration_ms: Date.now() - startedAt,
      dns: {
        resolved_ip: validated.resolvedIp,
        candidate_count: pinnedCandidates.length,
        candidates: pinnedCandidates
      },
      extraction: {
        title: extraction.title,
        text_chars: extraction.text.length,
        markdown_chars: extraction.markdown.length,
        has_raw_html: extraction.rawHtml.length > 0,
        fetch_diagnostics: extraction.diagnostics
      }
    });
  } catch (error) {
    if (error instanceof AppError) {
      const fetchDiagnostics = getHtmlFetchDiagnostics(error);
      printJson({
        ok: false,
        url: targetUrl,
        host: targetHost,
        duration_ms: Date.now() - startedAt,
        error: {
          type: "AppError",
          code: error.code,
          status: error.status,
          user_message: error.userMessage
        },
        fetch_diagnostics: fetchDiagnostics
      });
      process.exit(1);
    }

    const err = error instanceof Error ? error : new Error(String(error));
    const code =
      ((err as { code?: string }).code || (err as { cause?: { code?: string } }).cause?.code || "").toString() || null;

    printJson({
      ok: false,
      url: targetUrl,
      host: targetHost,
      duration_ms: Date.now() - startedAt,
      error: {
        type: "UnexpectedError",
        code,
        name: err.name,
        message: err.message
      }
    });
    process.exit(1);
  }
}

void main();
