import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AppError,
  canonicalizeFetchableUrl,
  errorCodes,
  extractHtmlFromUrlWithDiagnostics,
  extractHtmlSnapshot,
  extractTextFromPdf,
  getHtmlFetchDiagnostics,
  isLikelyLegacyAbsolutePath,
  normalizeStorageKey,
  summarizeHtmlExtractionSelection,
  type HtmlExtractionSelectionDiagnostics,
  type ObjectStorage
} from "@articlepod/core";

type ArticleSource = {
  id: string;
  sourceType: string;
  sourceUrl: string | null;
  sourceFilePath: string | null;
  sourceHtml: string | null;
};

type PreparationContext = {
  readObject: ObjectStorage["getObject"];
  storageBackend: string;
  rawArtifactRetentionDays: number;
  log: (stage: string, message: string, details?: Record<string, unknown>) => void;
};

export type ArticlePreparationResult = {
  title: string;
  text: string;
  markdown: string;
  sourceLabel: string;
  sourceArtifact: {
    kind: "RAW_HTML" | "RAW_PDF";
    storageKey: string;
    contentType: string;
    bytes: Buffer;
    expiresAt: Date | null;
  } | null;
  selectionDiagnostics?: HtmlExtractionSelectionDiagnostics | null;
};

function retentionExpiryDate(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export async function prepareArticleSource(
  item: ArticleSource,
  context: PreparationContext
): Promise<ArticlePreparationResult> {
  if (item.sourceType === "URL") {
    if (!item.sourceUrl) {
      throw new AppError(errorCodes.INVALID_INPUT, "Missing source URL", 400);
    }

    context.log("extract:url", "Validating URL source", {
      sourceUrl: item.sourceUrl
    });
    const canonicalized = await canonicalizeFetchableUrl(item.sourceUrl);
    const fetchUrl = canonicalized.canonicalUrl;
    const pinnedCandidates =
      canonicalized.resolvedIps && canonicalized.resolvedIps.length > 0
        ? canonicalized.resolvedIps
        : canonicalized.resolvedIp
          ? [canonicalized.resolvedIp]
          : [];
    context.log("extract:url", "URL validation passed", {
      pinnedCandidateCount: pinnedCandidates.length,
      canonicalUrl: fetchUrl,
      canonicalized: canonicalized.redirected,
      redirectCount: canonicalized.redirectCount
    });
    if (canonicalized.redirected) {
      context.log("extract:url", "Canonicalized submitted URL before extraction", {
        sourceUrl: item.sourceUrl,
        canonicalUrl: fetchUrl,
        redirectCount: canonicalized.redirectCount
      });
    }

    context.log("extract:url", "Fetching and parsing HTML", {
      pinnedCandidateCount: pinnedCandidates.length,
      fetchUrl
    });

    let extracted: Awaited<ReturnType<typeof extractHtmlFromUrlWithDiagnostics>>;
    try {
      extracted = await extractHtmlFromUrlWithDiagnostics(fetchUrl, pinnedCandidates);
    } catch (error) {
      const fetchDiagnostics = getHtmlFetchDiagnostics(error);
      if (fetchDiagnostics) {
        context.log("extract:url", "HTML extraction failed", {
          pinnedCandidateCount: fetchDiagnostics.pinnedCandidateCount,
          pinnedStatuses: fetchDiagnostics.pinnedStatuses,
          fallbackAttempted: fetchDiagnostics.fallbackAttempted,
          fallbackStatus: fetchDiagnostics.fallbackStatus,
          finalFetchStrategy: fetchDiagnostics.finalFetchStrategy
        });
      }
      throw error;
    }

    const extractedTitle = extracted.title ?? "";
    context.log("extract:url", "HTML extraction complete", {
      extractedTitleLength: extractedTitle.length,
      extractedTextLength: extracted.text.length,
      pinnedCandidateCount: extracted.diagnostics.pinnedCandidateCount,
      pinnedStatuses: extracted.diagnostics.pinnedStatuses,
      fallbackAttempted: extracted.diagnostics.fallbackAttempted,
      fallbackStatus: extracted.diagnostics.fallbackStatus,
      finalFetchStrategy: extracted.diagnostics.finalFetchStrategy,
      extractionSelection: summarizeHtmlExtractionSelection(extracted.selectionDiagnostics)
    });

    return {
      title: extractedTitle,
      text: extracted.text,
      markdown: extracted.markdown,
      sourceLabel: fetchUrl,
      sourceArtifact: {
        kind: "RAW_HTML",
        storageKey: normalizeStorageKey(join("items", item.id, "artifacts", "source.html")),
        contentType: "text/html; charset=utf-8",
        bytes: Buffer.from(extracted.rawHtml, "utf8"),
        expiresAt: retentionExpiryDate(context.rawArtifactRetentionDays)
      },
      selectionDiagnostics: extracted.selectionDiagnostics
    };
  }

  if (item.sourceType === "HTML_SNAPSHOT") {
    let snapshotHtml = item.sourceHtml?.trim() ?? "";
    if (!snapshotHtml && item.sourceFilePath) {
      if (isLikelyLegacyAbsolutePath(item.sourceFilePath)) {
        snapshotHtml = (await readFile(item.sourceFilePath, "utf8")).trim();
      } else {
        const storageKey = normalizeStorageKey(item.sourceFilePath);
        snapshotHtml = (await context.readObject(storageKey)).toString("utf8").trim();
      }
    }

    if (!snapshotHtml) {
      throw new AppError(errorCodes.INVALID_INPUT, "Missing captured HTML snapshot", 400);
    }

    context.log("extract:snapshot", "Parsing captured HTML snapshot", {
      sourceUrl: item.sourceUrl || "about:blank",
      htmlBytes: Buffer.byteLength(snapshotHtml, "utf8")
    });
    const extracted = extractHtmlSnapshot({
      html: snapshotHtml,
      url: item.sourceUrl || undefined
    });
    const extractedTitle = extracted.title ?? "";
    context.log("extract:snapshot", "Snapshot extraction complete", {
      extractedTitleLength: extractedTitle.length,
      extractedTextLength: extracted.text.length,
      extractionSelection: summarizeHtmlExtractionSelection(extracted.selectionDiagnostics)
    });

    return {
      title: extractedTitle,
      text: extracted.text,
      markdown: extracted.markdown,
      sourceLabel: item.sourceUrl || "Captured browser page",
      sourceArtifact: {
        kind: "RAW_HTML",
        storageKey: normalizeStorageKey(join("items", item.id, "artifacts", "source.html")),
        contentType: "text/html; charset=utf-8",
        bytes: Buffer.from(extracted.rawHtml, "utf8"),
        expiresAt: retentionExpiryDate(context.rawArtifactRetentionDays)
      },
      selectionDiagnostics: extracted.selectionDiagnostics
    };
  }

  if (!item.sourceFilePath) {
    if (item.sourceType !== "PDF") {
      throw new AppError(errorCodes.INVALID_INPUT, "Unsupported item source type", 400);
    }
    throw new AppError(errorCodes.INVALID_INPUT, "Missing source PDF path", 400);
  }

  if (item.sourceType !== "PDF") {
    throw new AppError(errorCodes.INVALID_INPUT, "Unsupported item source type", 400);
  }

  let pdfData: Buffer;
  if (isLikelyLegacyAbsolutePath(item.sourceFilePath)) {
    context.log("extract:pdf", "Reading uploaded PDF from legacy local path", {
      sourceFilePath: item.sourceFilePath
    });
    pdfData = await readFile(item.sourceFilePath);
  } else {
    const storageKey = normalizeStorageKey(item.sourceFilePath);
    context.log("extract:pdf", "Reading uploaded PDF from artifact storage", {
      storageKey,
      backend: context.storageBackend
    });
    pdfData = await context.readObject(storageKey);
  }

  context.log("extract:pdf", "PDF bytes loaded", {
    bytes: pdfData.byteLength
  });

  context.log("extract:pdf", "Extracting text from PDF");
  const extracted = await extractTextFromPdf(new Uint8Array(pdfData));
  const extractedTitle = extracted.title ?? "";
  context.log("extract:pdf", "PDF extraction complete", {
    extractedTitleLength: extractedTitle.length,
    extractedTextLength: extracted.text.length
  });

  return {
    title: extractedTitle,
    text: extracted.text,
    markdown: extracted.markdown,
    sourceLabel: "Uploaded PDF",
    sourceArtifact: {
      kind: "RAW_PDF",
      storageKey: normalizeStorageKey(join("items", item.id, "artifacts", "source.pdf")),
      contentType: "application/pdf",
      bytes: pdfData,
      expiresAt: retentionExpiryDate(context.rawArtifactRetentionDays)
    },
    selectionDiagnostics: null
  };
}
