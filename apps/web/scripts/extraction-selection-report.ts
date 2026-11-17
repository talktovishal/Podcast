import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseHtmlExtractionSelectionSummary } from "@articlepod/core";
import { webPrimaryStore, webUsesAzureTablePrimary } from "../src/lib/metadata-primary-store";
import { prisma } from "../src/lib/prisma";

type ReportRow = {
  id: string;
  userId: string;
  title: string | null;
  sourceType: string;
  sourceUrl: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  recordedAt: string | null;
  selectedEngine: string | null;
  selectionMode: string | null;
  scoreMargin: number | null;
  summary: ReturnType<typeof parseHtmlExtractionSelectionSummary>;
};

function parseArgs(): { limit: number; outFile: string } {
  const args = process.argv.slice(2);
  let limit = 200;
  let outFile = "../../exports/ops/extraction-selection-report.json";

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--limit") {
      limit = Math.max(1, Number.parseInt(args[i + 1] ?? "", 10) || limit);
      i += 1;
      continue;
    }
    if (args[i] === "--out") {
      outFile = args[i + 1] ?? outFile;
      i += 1;
    }
  }

  return { limit, outFile: resolve(process.cwd(), outFile) };
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(3));
}

function incrementCounter(counter: Record<string, number>, key: string | null | undefined) {
  if (!key) {
    return;
  }
  counter[key] = (counter[key] ?? 0) + 1;
}

function toReportRow(item: {
  id: string;
  userId: string;
  title: string | null;
  sourceType: string;
  sourceUrl: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  extractionEngine: string | null;
  extractionSelectionMode: string | null;
  extractionScoreMargin: number | null;
  extractionSummaryJson: string | null;
  extractionSelectionRecordedAt: Date | null;
}): ReportRow {
  return {
    id: item.id,
    userId: item.userId,
    title: item.title,
    sourceType: item.sourceType,
    sourceUrl: item.sourceUrl,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    recordedAt: item.extractionSelectionRecordedAt?.toISOString() ?? null,
    selectedEngine: item.extractionEngine,
    selectionMode: item.extractionSelectionMode,
    scoreMargin: item.extractionScoreMargin,
    summary: parseHtmlExtractionSelectionSummary(item.extractionSummaryJson)
  };
}

async function loadRows(limit: number): Promise<{ backend: "azure_table" | "prisma"; rows: ReportRow[] }> {
  if (webUsesAzureTablePrimary()) {
    if (!webPrimaryStore) {
      throw new Error("METADATA_PRIMARY_BACKEND=azure_table is set, but Azure Table primary store is not configured.");
    }
    const items = await webPrimaryStore.listItemsWithExtractionSelection(limit);
    return {
      backend: "azure_table",
      rows: items.map(toReportRow)
    };
  }

  const items = await prisma.item.findMany({
    where: {
      extractionSelectionRecordedAt: {
        not: null
      }
    },
    select: {
      id: true,
      userId: true,
      title: true,
      sourceType: true,
      sourceUrl: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      extractionEngine: true,
      extractionSelectionMode: true,
      extractionScoreMargin: true,
      extractionSummaryJson: true,
      extractionSelectionRecordedAt: true
    },
    orderBy: {
      extractionSelectionRecordedAt: "desc"
    },
    take: limit
  });

  return {
    backend: "prisma",
    rows: items.map(toReportRow)
  };
}

async function main() {
  const { limit, outFile } = parseArgs();
  const { backend, rows } = await loadRows(limit);

  const engineCounts: Record<string, number> = {};
  const selectionModeCounts: Record<string, number> = {};
  const sourceTypeCounts: Record<string, number> = {};
  const engineBySourceType: Record<string, Record<string, number>> = {};
  const statusCounts: Record<string, number> = {};
  const scoreMargins: number[] = [];
  const candidateFailureCounts: Record<string, number> = {};
  let parsedSummaryCount = 0;

  for (const row of rows) {
    incrementCounter(engineCounts, row.selectedEngine);
    incrementCounter(selectionModeCounts, row.selectionMode);
    incrementCounter(sourceTypeCounts, row.sourceType);
    incrementCounter(statusCounts, row.status);
    if (row.scoreMargin !== null) {
      scoreMargins.push(row.scoreMargin);
    }
    if (row.selectedEngine) {
      const bySourceType = (engineBySourceType[row.sourceType] ??= {});
      bySourceType[row.selectedEngine] = (bySourceType[row.selectedEngine] ?? 0) + 1;
    }
    if (!row.summary) {
      continue;
    }
    parsedSummaryCount += 1;
    for (const candidate of row.summary.candidates) {
      if (candidate.status === "failed") {
        candidateFailureCounts[candidate.engine] = (candidateFailureCounts[candidate.engine] ?? 0) + 1;
      }
    }
  }

  const payload = {
    capturedAt: new Date().toISOString(),
    metadataBackend: backend,
    limit,
    rowsAnalyzed: rows.length,
    parsedSummaryCount,
    aggregates: {
      engineCounts,
      selectionModeCounts,
      sourceTypeCounts,
      engineBySourceType,
      statusCounts,
      averageScoreMargin: average(scoreMargins),
      candidateFailureCounts
    },
    rows
  };

  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(payload, null, 2), "utf8");

  // eslint-disable-next-line no-console
  console.log(`[extraction-selection-report] wrote ${outFile}`);
  // eslint-disable-next-line no-console
  console.log(
    `[extraction-selection-report] backend=${backend} rows=${rows.length} engines=${JSON.stringify(engineCounts)} avg_margin=${String(payload.aggregates.averageScoreMargin)}`
  );
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
