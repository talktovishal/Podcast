import { TableClient, type TableEntityResult } from "@azure/data-tables";
import type {
  DigestRunProjection,
  ItemQueueProjection,
  JobQueueProjection,
  QueueMetadataMirror,
  QueuePressureMirrorSnapshot
} from "./types";

type AzureTableMirrorOptions = {
  tablePrefix: string;
  connectionString?: string;
  accountUrl?: string;
  sasToken?: string;
  createTablesIfMissing?: boolean;
};

type ItemProjectionEntity = {
  partitionKey: string;
  rowKey: string;
  userId: string;
  sourceType: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  errorCode?: string;
  errorMessage?: string;
};

type JobProjectionEntity = {
  partitionKey: string;
  rowKey: string;
  itemId: string;
  status: string;
  attempt: number;
  createdAt: string;
  updatedAt: string;
  lockedAt?: string;
  nextRetryAt?: string;
  errorCode?: string;
  errorMessage?: string;
};

type DigestRunProjectionEntity = {
  partitionKey: string;
  rowKey: string;
  userId: string;
  cadence: string;
  periodKey: string;
  status: string;
  attempt: number;
  createdAt: string;
  updatedAt: string;
  scheduledFor: string;
  lockedAt?: string;
  nextRetryAt?: string;
  errorCode?: string;
  errorMessage?: string;
};

function normalizeTablePrefix(rawPrefix: string): string {
  const compact = rawPrefix.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!compact) {
    return "articlepod";
  }
  if (compact.length < 3) {
    return `${compact}pod`;
  }
  if (compact.length > 40) {
    return compact.slice(0, 40);
  }
  return compact;
}

function buildTableName(prefix: string, suffix: string): string {
  const normalized = `${normalizeTablePrefix(prefix)}${suffix}`.replace(/[^a-z0-9]/g, "");
  if (normalized.length <= 63) {
    return normalized;
  }
  return normalized.slice(0, 63);
}

function toOptionalIso(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

function parseDate(input: unknown): Date | null {
  if (typeof input !== "string" || input.length === 0) {
    return null;
  }
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function toNumber(input: unknown, fallback: number): number {
  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }
  if (typeof input === "string" && input.trim().length > 0) {
    const parsed = Number(input);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function formatSasUrl(accountUrl: string, sasToken: string): string {
  const trimmedAccount = accountUrl.replace(/\/+$/, "");
  const trimmedToken = sasToken.replace(/^\?+/, "");
  const separator = trimmedAccount.includes("?") ? "&" : "?";
  return `${trimmedAccount}${separator}${trimmedToken}`;
}

function buildClientFactory(input: AzureTableMirrorOptions): (tableName: string) => TableClient {
  if (input.connectionString) {
    return (tableName: string) => TableClient.fromConnectionString(input.connectionString as string, tableName);
  }

  if (input.accountUrl && input.sasToken) {
    const signedUrl = formatSasUrl(input.accountUrl, input.sasToken);
    return (tableName: string) => new TableClient(signedUrl, tableName);
  }

  throw new Error("Azure Table mirror requires connection string or accountUrl + sasToken.");
}

export class AzureTableQueueMetadataMirror implements QueueMetadataMirror {
  readonly backend = "azure_table" as const;
  readonly enabled = true;

  private readonly itemsTable: TableClient;
  private readonly jobsTable: TableClient;
  private readonly digestRunsTable: TableClient;
  private readonly ensureTablesPromise: Promise<void>;

  constructor(input: AzureTableMirrorOptions) {
    const createClient = buildClientFactory(input);
    const itemsTableName = buildTableName(input.tablePrefix, "items");
    const jobsTableName = buildTableName(input.tablePrefix, "jobs");
    const digestRunsTableName = buildTableName(input.tablePrefix, "digests");

    this.itemsTable = createClient(itemsTableName);
    this.jobsTable = createClient(jobsTableName);
    this.digestRunsTable = createClient(digestRunsTableName);

    const shouldCreate = input.createTablesIfMissing ?? true;
    this.ensureTablesPromise = shouldCreate ? this.ensureTables() : Promise.resolve();
  }

  private async ensureTables(): Promise<void> {
    const createIfMissing = async (client: TableClient) => {
      await client.createTable().catch((error: unknown) => {
        const code =
          typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code || "") : "";
        if (code !== "TableAlreadyExists") {
          throw error;
        }
      });
    };

    await Promise.all([createIfMissing(this.itemsTable), createIfMissing(this.jobsTable), createIfMissing(this.digestRunsTable)]);
  }

  private async ensureReady(): Promise<void> {
    await this.ensureTablesPromise;
  }

  async upsertItemProjection(input: ItemQueueProjection): Promise<void> {
    await this.ensureReady();
    const entity: ItemProjectionEntity = {
      partitionKey: "item",
      rowKey: input.id,
      userId: input.userId,
      sourceType: input.sourceType,
      status: input.status,
      createdAt: input.createdAt.toISOString(),
      updatedAt: input.updatedAt.toISOString(),
      errorCode: input.errorCode ?? undefined,
      errorMessage: input.errorMessage ?? undefined
    };
    await this.itemsTable.upsertEntity(entity, "Replace");
  }

  async upsertJobProjection(input: JobQueueProjection): Promise<void> {
    await this.ensureReady();
    const entity: JobProjectionEntity = {
      partitionKey: "job",
      rowKey: input.id,
      itemId: input.itemId,
      status: input.status,
      attempt: input.attempt,
      createdAt: input.createdAt.toISOString(),
      updatedAt: input.updatedAt.toISOString(),
      lockedAt: toOptionalIso(input.lockedAt),
      nextRetryAt: toOptionalIso(input.nextRetryAt),
      errorCode: input.errorCode ?? undefined,
      errorMessage: input.errorMessage ?? undefined
    };
    await this.jobsTable.upsertEntity(entity, "Replace");
  }

  async upsertDigestRunProjection(input: DigestRunProjection): Promise<void> {
    await this.ensureReady();
    const entity: DigestRunProjectionEntity = {
      partitionKey: "digest",
      rowKey: input.id,
      userId: input.userId,
      cadence: input.cadence,
      periodKey: input.periodKey,
      status: input.status,
      attempt: input.attempt,
      createdAt: input.createdAt.toISOString(),
      updatedAt: input.updatedAt.toISOString(),
      scheduledFor: input.scheduledFor.toISOString(),
      lockedAt: toOptionalIso(input.lockedAt),
      nextRetryAt: toOptionalIso(input.nextRetryAt),
      errorCode: input.errorCode ?? undefined,
      errorMessage: input.errorMessage ?? undefined
    };
    await this.digestRunsTable.upsertEntity(entity, "Replace");
  }

  async deleteItemProjection(itemId: string): Promise<void> {
    await this.ensureReady();
    await this.itemsTable.deleteEntity("item", itemId).catch(() => undefined);
  }

  async deleteJobProjection(jobId: string): Promise<void> {
    await this.ensureReady();
    await this.jobsTable.deleteEntity("job", jobId).catch(() => undefined);
  }

  async deleteDigestRunProjection(digestRunId: string): Promise<void> {
    await this.ensureReady();
    await this.digestRunsTable.deleteEntity("digest", digestRunId).catch(() => undefined);
  }

  async getQueuePressureSnapshot(input: { now: Date; maxRetryAttempts: number }): Promise<QueuePressureMirrorSnapshot | null> {
    await this.ensureReady();
    const jobs: Array<TableEntityResult<Record<string, unknown>>> = [];

    const iterator = this.jobsTable.listEntities<Record<string, unknown>>({
      queryOptions: {
        filter: "PartitionKey eq 'job'"
      }
    });

    for await (const entity of iterator) {
      jobs.push(entity);
    }

    if (jobs.length === 0) {
      return {
        capturedAt: input.now,
        queuedJobs: 0,
        retryableFailedJobs: 0,
        processingJobs: 0,
        eligibleJobs: 0,
        oldestEligibleJobCreatedAt: null,
        oldestEligibleJobAgeMs: 0
      };
    }

    let queuedJobs = 0;
    let retryableFailedJobs = 0;
    let processingJobs = 0;
    let oldestEligibleCreatedAt: Date | null = null;

    for (const raw of jobs) {
      const status = typeof raw.status === "string" ? raw.status : "";
      const createdAt = parseDate(raw.createdAt);
      const attempt = toNumber(raw.attempt, 0);
      const nextRetryAt = parseDate(raw.nextRetryAt);

      if (status === "QUEUED") {
        queuedJobs++;
        if (createdAt && (!oldestEligibleCreatedAt || createdAt.getTime() < oldestEligibleCreatedAt.getTime())) {
          oldestEligibleCreatedAt = createdAt;
        }
        continue;
      }

      if (status === "PROCESSING") {
        processingJobs++;
        continue;
      }

      if (status === "FAILED") {
        const retryable = attempt < input.maxRetryAttempts && nextRetryAt !== null && nextRetryAt.getTime() <= input.now.getTime();
        if (retryable) {
          retryableFailedJobs++;
          if (createdAt && (!oldestEligibleCreatedAt || createdAt.getTime() < oldestEligibleCreatedAt.getTime())) {
            oldestEligibleCreatedAt = createdAt;
          }
        }
      }
    }

    const eligibleJobs = queuedJobs + retryableFailedJobs;
    const oldestEligibleJobAgeMs = oldestEligibleCreatedAt ? Math.max(0, input.now.getTime() - oldestEligibleCreatedAt.getTime()) : 0;

    return {
      capturedAt: input.now,
      queuedJobs,
      retryableFailedJobs,
      processingJobs,
      eligibleJobs,
      oldestEligibleJobCreatedAt: oldestEligibleCreatedAt,
      oldestEligibleJobAgeMs
    };
  }
}
