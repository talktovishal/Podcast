import { TableClient, type TableEntity, type TableEntityResult } from "@azure/data-tables";
import { parseStoredItemTags, serializeItemTags } from "../types/domain";

type AzureTablePrimaryStoreOptions = {
  tablePrefix: string;
  connectionString?: string;
  accountUrl?: string;
  sasToken?: string;
  createTablesIfMissing?: boolean;
};

type TableKey =
  | "users"
  | "sessions"
  | "billingWebhookEvents"
  | "feedTokens"
  | "digestFeedTokens"
  | "shareTokens"
  | "oauthIdentities"
  | "extensionConnectCodes"
  | "extensionTokens"
  | "items"
  | "jobs"
  | "itemArtifacts"
  | "episodes"
  | "chunkCache"
  | "digestSettings"
  | "digestRuns"
  | "digestEpisodes"
  | "summaryRuns"
  | "summaryRunItems"
  | "summaryEpisodes"
  | "digestSchedulerTicks"
  | "userDemographicSurveys";

export type AzureTablePrimaryEntityKey = TableKey;

export type AzureTablePrimaryUser = {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string | null;
  role: string;
  complimentaryPro: boolean;
  billingProvider: string | null;
  billingCustomerId: string | null;
  billingSubscriptionId: string | null;
  billingPriceId: string | null;
  billingPlanCode: string;
  billingStatus: string;
  billingEntitlementStatus: string;
  billingLastPaymentStatus: string;
  billingLastInvoiceId: string | null;
  billingCurrentPeriodEnd: Date | null;
  billingCancelAtPeriodEnd: boolean;
  billingLastStripeEventId: string | null;
  billingLastStripeEventCreatedAt: Date | null;
  billingLastSubscriptionEventAt: Date | null;
  billingLastInvoiceEventAt: Date | null;
  billingUpdatedAt: Date | null;
  isPaid: boolean;
  submissionCount: number;
  extraSubmissionCredits: number;
  ttsProvider: string;
  ttsVoice: string;
  firstSeenAt: Date | null;
  firstSeenCountryCode: string | null;
  firstSeenRegionCode: string | null;
  firstSeenCity: string | null;
  lastSeenAt: Date | null;
  lastSeenCountryCode: string | null;
  lastSeenRegionCode: string | null;
  lastSeenCity: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AzureTablePrimarySession = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
};

export type AzureTablePrimaryBillingWebhookEvent = {
  id: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  eventCreatedAt: Date | null;
  objectId: string | null;
  userId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  invoiceId: string | null;
  status: string;
  errorMessage: string | null;
  processedAt: Date | null;
  createdAt: Date;
};

export type AzureTablePrimaryTokenRow = {
  id: string;
  userId: string;
  tokenHash: string;
  tokenValue: string | null;
  active: boolean;
  createdAt: Date;
  rotatedAt: Date | null;
};

export type AzureTablePrimaryShareTokenRow = {
  id: string;
  userId: string;
  tokenHash: string;
  tokenValue: string | null;
  scope: string;
  expiresAt: Date | null;
  createdAt: Date;
};

export type AzureTablePrimaryOAuthIdentity = {
  id: string;
  userId: string;
  provider: string;
  providerUserId: string;
  emailAtLink: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AzureTablePrimaryExtensionConnectCode = {
  id: string;
  userId: string;
  codeHash: string;
  label: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

export type AzureTablePrimaryExtensionToken = {
  id: string;
  userId: string;
  tokenHash: string;
  tokenValue: string | null;
  label: string | null;
  scope: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
};

export type AzureTablePrimaryItem = {
  id: string;
  userId: string;
  title: string | null;
  sourceType: string;
  sourceUrl: string | null;
  sourceFilePath: string | null;
  sourceHtml: string | null;
  sourceCapturedAt: Date | null;
  status: string;
  priority: string;
  tags: string[];
  errorCode: string | null;
  errorMessage: string | null;
  textHash: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AzureTablePrimaryJob = {
  id: string;
  itemId: string;
  userId: string;
  attempt: number;
  status: string;
  lockedAt: Date | null;
  leaseId: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  lastHeartbeatAt: Date | null;
  dispatchMessageId: string | null;
  scheduledFor: Date | null;
  nextRetryAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AzureTablePrimaryItemArtifact = {
  id: string;
  itemId: string;
  kind: string;
  storageKey: string;
  contentType: string;
  byteLength: number;
  expiresAt: Date | null;
  createdAt: Date;
};

export type AzureTablePrimaryEpisode = {
  id: string;
  itemId: string;
  userId: string;
  guid: string;
  title: string;
  description: string;
  audioPath: string;
  audioBytes: number;
  mimeType: string;
  publishedAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
};

export type AzureTablePrimaryChunkCache = {
  id: string;
  itemId: string;
  chunkIndex: number;
  hash: string;
  filePath: string;
  audioBytes: number;
  mimeType: string;
  createdAt: Date;
};

export type AzureTablePrimaryDigestSettings = {
  id: string;
  userId: string;
  timezone: string;
  dailyEmailEnabled: boolean;
  dailyPodcastEnabled: boolean;
  dailyHour: number;
  dailyMinute: number;
  dailyLengthMinutes: number;
  dailyNextRunAt: Date | null;
  weeklyEmailEnabled: boolean;
  weeklyPodcastEnabled: boolean;
  weeklyDayOfWeek: number;
  weeklyHour: number;
  weeklyMinute: number;
  weeklyLengthMinutes: number;
  weeklyNextRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AzureTablePrimaryDigestRun = {
  id: string;
  userId: string;
  cadence: string;
  periodKey: string;
  windowStart: Date;
  windowEnd: Date;
  scheduledFor: Date;
  status: string;
  attempt: number;
  lockedAt: Date | null;
  nextRetryAt: Date | null;
  targetLengthMinutes: number;
  sourceItemCount: number;
  summaryStorageKey: string | null;
  summaryBytes: number | null;
  summaryProvider: string | null;
  summaryModel: string | null;
  summaryDeployment: string | null;
  summaryInputTokens: number | null;
  summaryOutputTokens: number | null;
  emailEnabled: boolean;
  emailStatus: string | null;
  emailSubject: string | null;
  emailStorageKey: string | null;
  emailError: string | null;
  podcastEnabled: boolean;
  podcastStatus: string | null;
  podcastError: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AzureTablePrimaryDigestEpisode = {
  id: string;
  digestRunId: string;
  userId: string;
  guid: string;
  title: string;
  description: string;
  audioPath: string;
  audioBytes: number;
  mimeType: string;
  publishedAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
};

export type AzureTablePrimarySummaryRun = {
  id: string;
  userId: string;
  requestedTitle: string | null;
  title: string | null;
  windowStart: Date;
  windowEnd: Date;
  status: string;
  attempt: number;
  lockedAt: Date | null;
  nextRetryAt: Date | null;
  targetLengthMinutes: number;
  selectedItemCount: number;
  podcastEnabled: boolean;
  podcastStatus: string | null;
  podcastError: string | null;
  summaryStorageKey: string | null;
  summaryBytes: number | null;
  summaryProvider: string | null;
  summaryModel: string | null;
  summaryDeployment: string | null;
  summaryInputTokens: number | null;
  summaryOutputTokens: number | null;
  fallbackUsed: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AzureTablePrimarySummaryRunItem = {
  id: string;
  summaryRunId: string;
  itemId: string;
  orderIndex: number;
  createdAt: Date;
};

export type AzureTablePrimarySummaryEpisode = {
  id: string;
  summaryRunId: string;
  userId: string;
  guid: string;
  title: string;
  description: string;
  audioPath: string;
  audioBytes: number;
  mimeType: string;
  publishedAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
};

export type AzureTablePrimaryDigestSchedulerTick = {
  id: string;
  requestedAt: Date;
  requestedBy: string;
  forceNow: boolean;
  processedAt: Date | null;
};

export type AzureTablePrimaryUserDemographicSurvey = {
  id: string;
  userId: string;
  status: string;
  ageBand: string | null;
  genderIdentity: string | null;
  genderSelfDescribe: string | null;
  completedAt: Date | null;
  skippedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type FilterValue = string | number | boolean | Date | null | undefined;

type EntityWithEtag<T> = T & { etag?: string };

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

function formatSasUrl(accountUrl: string, sasToken: string): string {
  const trimmedAccount = accountUrl.replace(/\/+$/, "");
  const trimmedToken = sasToken.replace(/^\?+/, "");
  const separator = trimmedAccount.includes("?") ? "&" : "?";
  return `${trimmedAccount}${separator}${trimmedToken}`;
}

function buildClientFactory(input: AzureTablePrimaryStoreOptions): (tableName: string) => TableClient {
  if (input.connectionString) {
    return (tableName: string) => TableClient.fromConnectionString(input.connectionString as string, tableName);
  }

  if (input.accountUrl && input.sasToken) {
    const signedUrl = formatSasUrl(input.accountUrl, input.sasToken);
    return (tableName: string) => new TableClient(signedUrl, tableName);
  }

  throw new Error("Azure Table primary store requires connection string or accountUrl + sasToken.");
}

function isoOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function escapeOdataString(value: string): string {
  return value.replace(/'/g, "''");
}

function filterEquals(field: string, value: FilterValue): string {
  if (value === null) {
    return `${field} eq null`;
  }
  if (value instanceof Date) {
    return `${field} eq '${value.toISOString()}'`;
  }
  if (typeof value === "string") {
    return `${field} eq '${escapeOdataString(value)}'`;
  }
  if (typeof value === "boolean") {
    return `${field} eq ${value ? "true" : "false"}`;
  }
  return `${field} eq ${String(value)}`;
}

function filterLessThan(field: string, value: number | Date | string): string {
  if (value instanceof Date) {
    return `${field} lt '${value.toISOString()}'`;
  }
  if (typeof value === "string") {
    return `${field} lt '${escapeOdataString(value)}'`;
  }
  return `${field} lt ${String(value)}`;
}

function filterLessThanOrEqual(field: string, value: number | Date | string): string {
  if (value instanceof Date) {
    return `${field} le '${value.toISOString()}'`;
  }
  if (typeof value === "string") {
    return `${field} le '${escapeOdataString(value)}'`;
  }
  return `${field} le ${String(value)}`;
}

function joinFilters(...filters: Array<string | null | undefined>): string | undefined {
  const cleaned = filters.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
  if (cleaned.length === 0) {
    return undefined;
  }
  if (cleaned.length === 1) {
    return cleaned[0];
  }
  return cleaned.map((value) => `(${value})`).join(" and ");
}

function parseString(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }
  return input;
}

function parseRequiredString(input: unknown, field: string): string {
  const value = parseString(input);
  if (value === null) {
    throw new Error(`Missing required string field "${field}" in Azure Table entity.`);
  }
  return value;
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

function hasUnsetDateValue(input: unknown): boolean {
  return parseDate(input) === null;
}

function parseRequiredDate(input: unknown, field: string): Date {
  const value = parseDate(input);
  if (!value) {
    throw new Error(`Missing required date field "${field}" in Azure Table entity.`);
  }
  return value;
}

function parseNumber(input: unknown, fallback = 0): number {
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

function parseBoolean(input: unknown, fallback = false): boolean {
  if (typeof input === "boolean") {
    return input;
  }
  if (typeof input === "number") {
    return input !== 0;
  }
  if (typeof input === "string") {
    const normalized = input.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
  }
  return fallback;
}

function sortByDateDesc<T>(entries: T[], accessor: (entry: T) => Date): T[] {
  return [...entries].sort((a, b) => accessor(b).getTime() - accessor(a).getTime());
}

function sortByTwoDatesDesc<T>(entries: T[], primary: (entry: T) => Date, secondary: (entry: T) => Date): T[] {
  return [...entries].sort((a, b) => {
    const primaryDiff = primary(b).getTime() - primary(a).getTime();
    if (primaryDiff !== 0) {
      return primaryDiff;
    }
    return secondary(b).getTime() - secondary(a).getTime();
  });
}

function jobLeaseDeadline(job: {
  leaseExpiresAt: Date | null;
  lockedAt: Date | null;
}): Date | null {
  return job.leaseExpiresAt ?? job.lockedAt;
}

function jobLeaseExpired(
  job: {
    leaseExpiresAt: Date | null;
    lockedAt: Date | null;
  },
  now: Date,
  legacyLockMs = 0
): boolean {
  const deadline = job.leaseExpiresAt
    ? job.leaseExpiresAt
    : job.lockedAt
      ? new Date(job.lockedAt.getTime() + legacyLockMs)
      : null;
  return deadline !== null && deadline.getTime() <= now.getTime();
}

function jobEligibleForClaim(
  job: {
    status: string;
    attempt: number;
    scheduledFor: Date | null;
    nextRetryAt: Date | null;
    leaseExpiresAt: Date | null;
    lockedAt: Date | null;
  },
  now: Date,
  maxRetryAttempts: number,
  legacyLockMs = 0
): boolean {
  const retryable =
    job.status === "FAILED" &&
    job.attempt < maxRetryAttempts &&
    job.nextRetryAt !== null &&
    job.nextRetryAt.getTime() <= now.getTime();
  const queuedReady = job.status === "QUEUED" && (job.scheduledFor === null || job.scheduledFor.getTime() <= now.getTime());
  const expiredProcessing = job.status === "PROCESSING" && jobLeaseExpired(job, now, legacyLockMs);
  return queuedReady || retryable || expiredProcessing;
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "statusCode" in error && (error as { statusCode?: unknown }).statusCode === 404);
}

function isConflictError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "statusCode" in error && (error as { statusCode?: unknown }).statusCode === 409);
}

function isPreconditionError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "statusCode" in error && (error as { statusCode?: unknown }).statusCode === 412);
}

export class AzureTablePrimaryStore {
  readonly backend = "azure_table" as const;

  private readonly clients: Record<TableKey, TableClient>;
  private readonly ensureTablesPromise: Promise<void>;

  constructor(input: AzureTablePrimaryStoreOptions) {
    const createClient = buildClientFactory(input);
    this.clients = {
      users: createClient(buildTableName(input.tablePrefix, "users")),
      sessions: createClient(buildTableName(input.tablePrefix, "sessions")),
      billingWebhookEvents: createClient(buildTableName(input.tablePrefix, "billingevents")),
      feedTokens: createClient(buildTableName(input.tablePrefix, "feedtokens")),
      digestFeedTokens: createClient(buildTableName(input.tablePrefix, "digestfeedtokens")),
      shareTokens: createClient(buildTableName(input.tablePrefix, "sharetokens")),
      oauthIdentities: createClient(buildTableName(input.tablePrefix, "oauthidentities")),
      extensionConnectCodes: createClient(buildTableName(input.tablePrefix, "extensioncodes")),
      extensionTokens: createClient(buildTableName(input.tablePrefix, "extensiontokens")),
      items: createClient(buildTableName(input.tablePrefix, "items")),
      jobs: createClient(buildTableName(input.tablePrefix, "jobs")),
      itemArtifacts: createClient(buildTableName(input.tablePrefix, "artifacts")),
      episodes: createClient(buildTableName(input.tablePrefix, "episodes")),
      chunkCache: createClient(buildTableName(input.tablePrefix, "chunkcache")),
      digestSettings: createClient(buildTableName(input.tablePrefix, "digestsettings")),
      digestRuns: createClient(buildTableName(input.tablePrefix, "digestruns")),
      digestEpisodes: createClient(buildTableName(input.tablePrefix, "digestepisodes")),
      summaryRuns: createClient(buildTableName(input.tablePrefix, "summaryruns")),
      summaryRunItems: createClient(buildTableName(input.tablePrefix, "summaryrunitems")),
      summaryEpisodes: createClient(buildTableName(input.tablePrefix, "summaryepisodes")),
      digestSchedulerTicks: createClient(buildTableName(input.tablePrefix, "digestschedticks")),
      userDemographicSurveys: createClient(buildTableName(input.tablePrefix, "demographics"))
    };

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

    await Promise.all(Object.values(this.clients).map((client) => createIfMissing(client)));
  }

  private async ready(): Promise<void> {
    await this.ensureTablesPromise;
  }

  private client(key: TableKey): TableClient {
    return this.clients[key];
  }

  private async getEntity<T extends Record<string, unknown>>(
    key: TableKey,
    partitionKey: string,
    rowKey: string
  ): Promise<TableEntityResult<T> | null> {
    await this.ready();
    try {
      return await this.client(key).getEntity<T>(partitionKey, rowKey);
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async listEntities<T extends Record<string, unknown>>(key: TableKey, filter?: string): Promise<Array<TableEntityResult<T>>> {
    await this.ready();
    const results: Array<TableEntityResult<T>> = [];
    const iterator = this.client(key).listEntities<T>({
      queryOptions: filter ? { filter } : undefined
    });

    for await (const entity of iterator) {
      results.push(entity);
    }

    return results;
  }

  private async firstEntity<T extends Record<string, unknown>>(key: TableKey, filter?: string): Promise<TableEntityResult<T> | null> {
    const entities = await this.listEntities<T>(key, filter);
    return entities[0] ?? null;
  }

  private async createEntity<T extends Record<string, unknown>>(
    key: TableKey,
    entity: TableEntity<T>
  ): Promise<void> {
    await this.ready();
    await this.client(key).createEntity(entity);
  }

  private async upsertEntity<T extends Record<string, unknown>>(
    key: TableKey,
    entity: TableEntity<T>,
    mode: "Merge" | "Replace" = "Replace"
  ): Promise<void> {
    await this.ready();
    await this.client(key).upsertEntity(entity, mode);
  }

  async upsertRawEntity(
    key: AzureTablePrimaryEntityKey,
    entity: TableEntity<Record<string, unknown>>,
    mode: "Merge" | "Replace" = "Replace"
  ): Promise<void> {
    await this.upsertEntity(key, entity, mode);
  }

  private async updateEntity<T extends Record<string, unknown>>(
    key: TableKey,
    entity: TableEntity<T>,
    etag?: string
  ): Promise<boolean> {
    await this.ready();
    try {
      await this.client(key).updateEntity(entity, "Replace", etag ? { etag } : undefined);
      return true;
    } catch (error) {
      if (isPreconditionError(error) || isNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  private async deleteEntity(key: TableKey, partitionKey: string, rowKey: string): Promise<void> {
    await this.ready();
    await this.client(key).deleteEntity(partitionKey, rowKey).catch((error: unknown) => {
      if (isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    });
  }

  private async deleteEntitiesByFilter<T extends Record<string, unknown>>(
    key: TableKey,
    filter: string,
    partitionKey: string
  ): Promise<number> {
    const rows = await this.listEntities<T>(key, filter);
    await Promise.all(rows.map((row) => this.deleteEntity(key, partitionKey, String(row.rowKey))));
    return rows.length;
  }

  private toUser(entity: TableEntityResult<Record<string, unknown>>): AzureTablePrimaryUser {
    return {
      id: String(entity.rowKey),
      email: parseRequiredString(entity.email, "email"),
      passwordHash: parseString(entity.passwordHash),
      name: parseString(entity.name),
      role: parseRequiredString(entity.role, "role"),
      complimentaryPro: parseBoolean(entity.complimentaryPro, false),
      billingProvider: parseString(entity.billingProvider),
      billingCustomerId: parseString(entity.billingCustomerId),
      billingSubscriptionId: parseString(entity.billingSubscriptionId),
      billingPriceId: parseString(entity.billingPriceId),
      billingPlanCode: parseString(entity.billingPlanCode) || "STARTER",
      billingStatus: parseString(entity.billingStatus) || "NONE",
      billingEntitlementStatus: parseString(entity.billingEntitlementStatus) || "INACTIVE",
      billingLastPaymentStatus: parseString(entity.billingLastPaymentStatus) || "NONE",
      billingLastInvoiceId: parseString(entity.billingLastInvoiceId),
      billingCurrentPeriodEnd: parseDate(entity.billingCurrentPeriodEnd),
      billingCancelAtPeriodEnd: parseBoolean(entity.billingCancelAtPeriodEnd, false),
      billingLastStripeEventId: parseString(entity.billingLastStripeEventId),
      billingLastStripeEventCreatedAt: parseDate(entity.billingLastStripeEventCreatedAt),
      billingLastSubscriptionEventAt: parseDate(entity.billingLastSubscriptionEventAt),
      billingLastInvoiceEventAt: parseDate(entity.billingLastInvoiceEventAt),
      billingUpdatedAt: parseDate(entity.billingUpdatedAt),
      isPaid: parseBoolean(entity.isPaid, false),
      submissionCount: parseNumber(entity.submissionCount, 0),
      extraSubmissionCredits: parseNumber(entity.extraSubmissionCredits, 0),
      ttsProvider: parseString(entity.ttsProvider) || "kokoro",
      ttsVoice: parseString(entity.ttsVoice) || "af_heart",
      firstSeenAt: parseDate(entity.firstSeenAt),
      firstSeenCountryCode: parseString(entity.firstSeenCountryCode),
      firstSeenRegionCode: parseString(entity.firstSeenRegionCode),
      firstSeenCity: parseString(entity.firstSeenCity),
      lastSeenAt: parseDate(entity.lastSeenAt),
      lastSeenCountryCode: parseString(entity.lastSeenCountryCode),
      lastSeenRegionCode: parseString(entity.lastSeenRegionCode),
      lastSeenCity: parseString(entity.lastSeenCity),
      createdAt: parseRequiredDate(entity.createdAt, "createdAt"),
      updatedAt: parseRequiredDate(entity.updatedAt, "updatedAt")
    };
  }

  private toBillingWebhookEvent(entity: TableEntityResult<Record<string, unknown>>): AzureTablePrimaryBillingWebhookEvent {
    return {
      id: parseRequiredString(entity.id, "id"),
      provider: parseRequiredString(entity.provider, "provider"),
      providerEventId: parseRequiredString(entity.providerEventId, "providerEventId"),
      eventType: parseRequiredString(entity.eventType, "eventType"),
      eventCreatedAt: parseDate(entity.eventCreatedAt),
      objectId: parseString(entity.objectId),
      userId: parseString(entity.userId),
      customerId: parseString(entity.customerId),
      subscriptionId: parseString(entity.subscriptionId),
      invoiceId: parseString(entity.invoiceId),
      status: parseString(entity.status) || "PROCESSED",
      errorMessage: parseString(entity.errorMessage),
      processedAt: parseDate(entity.processedAt),
      createdAt: parseRequiredDate(entity.createdAt, "createdAt")
    };
  }

  private toSession(entity: TableEntityResult<Record<string, unknown>>): AzureTablePrimarySession {
    return {
      id: parseRequiredString(entity.id, "id"),
      userId: parseRequiredString(entity.userId, "userId"),
      tokenHash: String(entity.rowKey),
      expiresAt: parseRequiredDate(entity.expiresAt, "expiresAt"),
      createdAt: parseRequiredDate(entity.createdAt, "createdAt")
    };
  }

  private toTokenRow(entity: TableEntityResult<Record<string, unknown>>): AzureTablePrimaryTokenRow {
    return {
      id: parseRequiredString(entity.id, "id"),
      userId: parseRequiredString(entity.userId, "userId"),
      tokenHash: parseRequiredString(entity.tokenHash, "tokenHash"),
      tokenValue: parseString(entity.tokenValue),
      active: parseBoolean(entity.active, true),
      createdAt: parseRequiredDate(entity.createdAt, "createdAt"),
      rotatedAt: parseDate(entity.rotatedAt)
    };
  }

  private toShareTokenRow(entity: TableEntityResult<Record<string, unknown>>): AzureTablePrimaryShareTokenRow {
    return {
      id: parseRequiredString(entity.id, "id"),
      userId: parseRequiredString(entity.userId, "userId"),
      tokenHash: parseRequiredString(entity.tokenHash, "tokenHash"),
      tokenValue: parseString(entity.tokenValue),
      scope: parseString(entity.scope) || "read_only",
      expiresAt: parseDate(entity.expiresAt),
      createdAt: parseRequiredDate(entity.createdAt, "createdAt")
    };
  }

  private toOAuthIdentity(entity: TableEntityResult<Record<string, unknown>>): AzureTablePrimaryOAuthIdentity {
    return {
      id: parseRequiredString(entity.id, "id"),
      userId: parseRequiredString(entity.userId, "userId"),
      provider: parseRequiredString(entity.provider, "provider"),
      providerUserId: parseRequiredString(entity.providerUserId, "providerUserId"),
      emailAtLink: parseString(entity.emailAtLink),
      createdAt: parseRequiredDate(entity.createdAt, "createdAt"),
      updatedAt: parseRequiredDate(entity.updatedAt, "updatedAt")
    };
  }

  private toExtensionConnectCode(entity: TableEntityResult<Record<string, unknown>>): AzureTablePrimaryExtensionConnectCode {
    return {
      id: parseRequiredString(entity.id, "id"),
      userId: parseRequiredString(entity.userId, "userId"),
      codeHash: parseRequiredString(entity.codeHash, "codeHash"),
      label: parseString(entity.label),
      expiresAt: parseRequiredDate(entity.expiresAt, "expiresAt"),
      consumedAt: parseDate(entity.consumedAt),
      createdAt: parseRequiredDate(entity.createdAt, "createdAt")
    };
  }

  private toExtensionToken(entity: TableEntityResult<Record<string, unknown>>): AzureTablePrimaryExtensionToken {
    return {
      id: parseRequiredString(entity.id, "id"),
      userId: parseRequiredString(entity.userId, "userId"),
      tokenHash: parseRequiredString(entity.tokenHash, "tokenHash"),
      tokenValue: parseString(entity.tokenValue),
      label: parseString(entity.label),
      scope: parseString(entity.scope) || "ingest:html_snapshot",
      expiresAt: parseDate(entity.expiresAt),
      revokedAt: parseDate(entity.revokedAt),
      lastUsedAt: parseDate(entity.lastUsedAt),
      createdAt: parseRequiredDate(entity.createdAt, "createdAt")
    };
  }

  private toItem(entity: TableEntityResult<Record<string, unknown>>): AzureTablePrimaryItem {
    return {
      id: String(entity.rowKey),
      userId: parseRequiredString(entity.userId, "userId"),
      title: parseString(entity.title),
      sourceType: parseRequiredString(entity.sourceType, "sourceType"),
      sourceUrl: parseString(entity.sourceUrl),
      sourceFilePath: parseString(entity.sourceFilePath),
      sourceHtml: parseString(entity.sourceHtml),
      sourceCapturedAt: parseDate(entity.sourceCapturedAt),
      status: parseRequiredString(entity.status, "status"),
      priority: parseString(entity.priority) ?? "LOW",
      tags: parseStoredItemTags(entity.tagsJson),
      errorCode: parseString(entity.errorCode),
      errorMessage: parseString(entity.errorMessage),
      textHash: parseString(entity.textHash),
      createdAt: parseRequiredDate(entity.createdAt, "createdAt"),
      updatedAt: parseRequiredDate(entity.updatedAt, "updatedAt")
    };
  }

  private toJob(entity: TableEntityResult<Record<string, unknown>>): AzureTablePrimaryJob {
    return {
      id: String(entity.rowKey),
      itemId: parseRequiredString(entity.itemId, "itemId"),
      userId: parseRequiredString(entity.userId, "userId"),
      attempt: parseNumber(entity.attempt, 0),
      status: parseRequiredString(entity.status, "status"),
      lockedAt: parseDate(entity.lockedAt),
      leaseId: parseString(entity.leaseId),
      leaseOwner: parseString(entity.leaseOwner),
      leaseExpiresAt: parseDate(entity.leaseExpiresAt),
      lastHeartbeatAt: parseDate(entity.lastHeartbeatAt),
      dispatchMessageId: parseString(entity.dispatchMessageId),
      scheduledFor: parseDate(entity.scheduledFor),
      nextRetryAt: parseDate(entity.nextRetryAt),
      errorCode: parseString(entity.errorCode),
      errorMessage: parseString(entity.errorMessage),
      createdAt: parseRequiredDate(entity.createdAt, "createdAt"),
      updatedAt: parseRequiredDate(entity.updatedAt, "updatedAt")
    };
  }

  private toItemArtifact(entity: TableEntityResult<Record<string, unknown>>): AzureTablePrimaryItemArtifact {
    return {
      id: parseRequiredString(entity.id, "id"),
      itemId: parseRequiredString(entity.itemId, "itemId"),
      kind: parseRequiredString(entity.kind, "kind"),
      storageKey: parseRequiredString(entity.storageKey, "storageKey"),
      contentType: parseRequiredString(entity.contentType, "contentType"),
      byteLength: parseNumber(entity.byteLength, 0),
      expiresAt: parseDate(entity.expiresAt),
      createdAt: parseRequiredDate(entity.createdAt, "createdAt")
    };
  }

  private toEpisode(entity: TableEntityResult<Record<string, unknown>>): AzureTablePrimaryEpisode {
    return {
      id: String(entity.rowKey),
      itemId: parseRequiredString(entity.itemId, "itemId"),
      userId: parseRequiredString(entity.userId, "userId"),
      guid: parseRequiredString(entity.guid, "guid"),
      title: parseRequiredString(entity.title, "title"),
      description: parseRequiredString(entity.description, "description"),
      audioPath: parseRequiredString(entity.audioPath, "audioPath"),
      audioBytes: parseNumber(entity.audioBytes, 0),
      mimeType: parseRequiredString(entity.mimeType, "mimeType"),
      publishedAt: parseRequiredDate(entity.publishedAt, "publishedAt"),
      expiresAt: parseDate(entity.expiresAt),
      createdAt: parseRequiredDate(entity.createdAt, "createdAt")
    };
  }

  private toChunkCache(entity: TableEntityResult<Record<string, unknown>>): AzureTablePrimaryChunkCache {
    return {
      id: parseRequiredString(entity.id, "id"),
      itemId: parseRequiredString(entity.itemId, "itemId"),
      chunkIndex: parseNumber(entity.chunkIndex, 0),
      hash: parseRequiredString(entity.hash, "hash"),
      filePath: parseRequiredString(entity.filePath, "filePath"),
      audioBytes: parseNumber(entity.audioBytes, 0),
      mimeType: parseRequiredString(entity.mimeType, "mimeType"),
      createdAt: parseRequiredDate(entity.createdAt, "createdAt")
    };
  }

  private toDigestSettings(entity: TableEntityResult<Record<string, unknown>>): AzureTablePrimaryDigestSettings {
    return {
      id: parseRequiredString(entity.id, "id"),
      userId: parseRequiredString(entity.userId, "userId"),
      timezone: parseString(entity.timezone) || "UTC",
      dailyEmailEnabled: parseBoolean(entity.dailyEmailEnabled, false),
      dailyPodcastEnabled: parseBoolean(entity.dailyPodcastEnabled, false),
      dailyHour: parseNumber(entity.dailyHour, 16),
      dailyMinute: parseNumber(entity.dailyMinute, 0),
      dailyLengthMinutes: parseNumber(entity.dailyLengthMinutes, 5),
      dailyNextRunAt: parseDate(entity.dailyNextRunAt),
      weeklyEmailEnabled: parseBoolean(entity.weeklyEmailEnabled, true),
      weeklyPodcastEnabled: parseBoolean(entity.weeklyPodcastEnabled, true),
      weeklyDayOfWeek: parseNumber(entity.weeklyDayOfWeek, 5),
      weeklyHour: parseNumber(entity.weeklyHour, 16),
      weeklyMinute: parseNumber(entity.weeklyMinute, 0),
      weeklyLengthMinutes: parseNumber(entity.weeklyLengthMinutes, 15),
      weeklyNextRunAt: parseDate(entity.weeklyNextRunAt),
      createdAt: parseRequiredDate(entity.createdAt, "createdAt"),
      updatedAt: parseRequiredDate(entity.updatedAt, "updatedAt")
    };
  }

  private toDigestRun(entity: TableEntityResult<Record<string, unknown>>): AzureTablePrimaryDigestRun {
    return {
      id: String(entity.rowKey),
      userId: parseRequiredString(entity.userId, "userId"),
      cadence: parseRequiredString(entity.cadence, "cadence"),
      periodKey: parseRequiredString(entity.periodKey, "periodKey"),
      windowStart: parseRequiredDate(entity.windowStart, "windowStart"),
      windowEnd: parseRequiredDate(entity.windowEnd, "windowEnd"),
      scheduledFor: parseRequiredDate(entity.scheduledFor, "scheduledFor"),
      status: parseRequiredString(entity.status, "status"),
      attempt: parseNumber(entity.attempt, 0),
      lockedAt: parseDate(entity.lockedAt),
      nextRetryAt: parseDate(entity.nextRetryAt),
      targetLengthMinutes: parseNumber(entity.targetLengthMinutes, 15),
      sourceItemCount: parseNumber(entity.sourceItemCount, 0),
      summaryStorageKey: parseString(entity.summaryStorageKey),
      summaryBytes: entity.summaryBytes === null || entity.summaryBytes === undefined ? null : parseNumber(entity.summaryBytes, 0),
      summaryProvider: parseString(entity.summaryProvider),
      summaryModel: parseString(entity.summaryModel),
      summaryDeployment: parseString(entity.summaryDeployment),
      summaryInputTokens:
        entity.summaryInputTokens === null || entity.summaryInputTokens === undefined ? null : parseNumber(entity.summaryInputTokens, 0),
      summaryOutputTokens:
        entity.summaryOutputTokens === null || entity.summaryOutputTokens === undefined ? null : parseNumber(entity.summaryOutputTokens, 0),
      emailEnabled: parseBoolean(entity.emailEnabled, false),
      emailStatus: parseString(entity.emailStatus),
      emailSubject: parseString(entity.emailSubject),
      emailStorageKey: parseString(entity.emailStorageKey),
      emailError: parseString(entity.emailError),
      podcastEnabled: parseBoolean(entity.podcastEnabled, false),
      podcastStatus: parseString(entity.podcastStatus),
      podcastError: parseString(entity.podcastError),
      errorCode: parseString(entity.errorCode),
      errorMessage: parseString(entity.errorMessage),
      completedAt: parseDate(entity.completedAt),
      createdAt: parseRequiredDate(entity.createdAt, "createdAt"),
      updatedAt: parseRequiredDate(entity.updatedAt, "updatedAt")
    };
  }

  private toDigestEpisode(entity: TableEntityResult<Record<string, unknown>>): AzureTablePrimaryDigestEpisode {
    return {
      id: String(entity.rowKey),
      digestRunId: parseRequiredString(entity.digestRunId, "digestRunId"),
      userId: parseRequiredString(entity.userId, "userId"),
      guid: parseRequiredString(entity.guid, "guid"),
      title: parseRequiredString(entity.title, "title"),
      description: parseRequiredString(entity.description, "description"),
      audioPath: parseRequiredString(entity.audioPath, "audioPath"),
      audioBytes: parseNumber(entity.audioBytes, 0),
      mimeType: parseRequiredString(entity.mimeType, "mimeType"),
      publishedAt: parseRequiredDate(entity.publishedAt, "publishedAt"),
      expiresAt: parseDate(entity.expiresAt),
      createdAt: parseRequiredDate(entity.createdAt, "createdAt")
    };
  }

  private toSummaryRun(entity: TableEntityResult<Record<string, unknown>>): AzureTablePrimarySummaryRun {
    return {
      id: String(entity.rowKey),
      userId: parseRequiredString(entity.userId, "userId"),
      requestedTitle: parseString(entity.requestedTitle),
      title: parseString(entity.title),
      windowStart: parseRequiredDate(entity.windowStart, "windowStart"),
      windowEnd: parseRequiredDate(entity.windowEnd, "windowEnd"),
      status: parseRequiredString(entity.status, "status"),
      attempt: parseNumber(entity.attempt, 0),
      lockedAt: parseDate(entity.lockedAt),
      nextRetryAt: parseDate(entity.nextRetryAt),
      targetLengthMinutes: parseNumber(entity.targetLengthMinutes, 15),
      selectedItemCount: parseNumber(entity.selectedItemCount, 0),
      podcastEnabled: parseBoolean(entity.podcastEnabled, true),
      podcastStatus: parseString(entity.podcastStatus),
      podcastError: parseString(entity.podcastError),
      summaryStorageKey: parseString(entity.summaryStorageKey),
      summaryBytes: entity.summaryBytes === null || entity.summaryBytes === undefined ? null : parseNumber(entity.summaryBytes, 0),
      summaryProvider: parseString(entity.summaryProvider),
      summaryModel: parseString(entity.summaryModel),
      summaryDeployment: parseString(entity.summaryDeployment),
      summaryInputTokens:
        entity.summaryInputTokens === null || entity.summaryInputTokens === undefined ? null : parseNumber(entity.summaryInputTokens, 0),
      summaryOutputTokens:
        entity.summaryOutputTokens === null || entity.summaryOutputTokens === undefined ? null : parseNumber(entity.summaryOutputTokens, 0),
      fallbackUsed: parseBoolean(entity.fallbackUsed, false),
      errorCode: parseString(entity.errorCode),
      errorMessage: parseString(entity.errorMessage),
      completedAt: parseDate(entity.completedAt),
      createdAt: parseRequiredDate(entity.createdAt, "createdAt"),
      updatedAt: parseRequiredDate(entity.updatedAt, "updatedAt")
    };
  }

  private toSummaryRunItem(entity: TableEntityResult<Record<string, unknown>>): AzureTablePrimarySummaryRunItem {
    return {
      id: parseRequiredString(entity.id, "id"),
      summaryRunId: parseRequiredString(entity.summaryRunId, "summaryRunId"),
      itemId: parseRequiredString(entity.itemId, "itemId"),
      orderIndex: parseNumber(entity.orderIndex, 0),
      createdAt: parseRequiredDate(entity.createdAt, "createdAt")
    };
  }

  private toSummaryEpisode(entity: TableEntityResult<Record<string, unknown>>): AzureTablePrimarySummaryEpisode {
    return {
      id: String(entity.rowKey),
      summaryRunId: parseRequiredString(entity.summaryRunId, "summaryRunId"),
      userId: parseRequiredString(entity.userId, "userId"),
      guid: parseRequiredString(entity.guid, "guid"),
      title: parseRequiredString(entity.title, "title"),
      description: parseRequiredString(entity.description, "description"),
      audioPath: parseRequiredString(entity.audioPath, "audioPath"),
      audioBytes: parseNumber(entity.audioBytes, 0),
      mimeType: parseRequiredString(entity.mimeType, "mimeType"),
      publishedAt: parseRequiredDate(entity.publishedAt, "publishedAt"),
      expiresAt: parseDate(entity.expiresAt),
      createdAt: parseRequiredDate(entity.createdAt, "createdAt")
    };
  }

  private toDigestSchedulerTick(entity: TableEntityResult<Record<string, unknown>>): AzureTablePrimaryDigestSchedulerTick {
    return {
      id: String(entity.rowKey),
      requestedAt: parseRequiredDate(entity.requestedAt, "requestedAt"),
      requestedBy: parseRequiredString(entity.requestedBy, "requestedBy"),
      forceNow: parseBoolean(entity.forceNow, false),
      processedAt: parseDate(entity.processedAt)
    };
  }

  private toUserDemographicSurvey(
    entity: TableEntityResult<Record<string, unknown>>
  ): AzureTablePrimaryUserDemographicSurvey {
    return {
      id: parseRequiredString(entity.id, "id"),
      userId: parseRequiredString(entity.userId, "userId"),
      status: parseString(entity.status) || "PENDING",
      ageBand: parseString(entity.ageBand),
      genderIdentity: parseString(entity.genderIdentity),
      genderSelfDescribe: parseString(entity.genderSelfDescribe),
      completedAt: parseDate(entity.completedAt),
      skippedAt: parseDate(entity.skippedAt),
      deletedAt: parseDate(entity.deletedAt),
      createdAt: parseRequiredDate(entity.createdAt, "createdAt"),
      updatedAt: parseRequiredDate(entity.updatedAt, "updatedAt")
    };
  }

  async findUserById(userId: string): Promise<AzureTablePrimaryUser | null> {
    const entity = await this.getEntity<Record<string, unknown>>("users", "user", userId);
    return entity ? this.toUser(entity) : null;
  }

  async findUserByEmail(email: string): Promise<AzureTablePrimaryUser | null> {
    const entity = await this.firstEntity<Record<string, unknown>>(
      "users",
      joinFilters(filterEquals("PartitionKey", "user"), filterEquals("email", email.toLowerCase()))
    );
    return entity ? this.toUser(entity) : null;
  }

  async findUserByBillingCustomerId(customerId: string): Promise<AzureTablePrimaryUser | null> {
    const entity = await this.firstEntity<Record<string, unknown>>(
      "users",
      joinFilters(filterEquals("PartitionKey", "user"), filterEquals("billingCustomerId", customerId))
    );
    return entity ? this.toUser(entity) : null;
  }

  async listUsers(limit = 100): Promise<AzureTablePrimaryUser[]> {
    if (limit <= 0) {
      return [];
    }
    const rows = await this.listEntities<Record<string, unknown>>("users", filterEquals("PartitionKey", "user"));
    return sortByDateDesc(rows.map((row) => this.toUser(row)), (entry) => entry.createdAt).slice(0, limit);
  }

  async countUsers(): Promise<number> {
    const rows = await this.listEntities<Record<string, unknown>>("users", filterEquals("PartitionKey", "user"));
    return rows.length;
  }

  async findBillingWebhookEvent(
    provider: string,
    providerEventId: string
  ): Promise<AzureTablePrimaryBillingWebhookEvent | null> {
    const entity = await this.getEntity<Record<string, unknown>>("billingWebhookEvents", provider, providerEventId);
    return entity ? this.toBillingWebhookEvent(entity) : null;
  }

  async createBillingWebhookEvent(input: {
    id: string;
    provider: string;
    providerEventId: string;
    eventType: string;
    eventCreatedAt?: Date | null;
    objectId?: string | null;
    userId?: string | null;
    customerId?: string | null;
    subscriptionId?: string | null;
    invoiceId?: string | null;
    status?: string;
    errorMessage?: string | null;
    processedAt?: Date | null;
    createdAt?: Date;
  }): Promise<AzureTablePrimaryBillingWebhookEvent> {
    const createdAt = input.createdAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      partitionKey: input.provider,
      rowKey: input.providerEventId,
      id: input.id,
      provider: input.provider,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      eventCreatedAt: isoOrNull(input.eventCreatedAt),
      objectId: input.objectId ?? null,
      userId: input.userId ?? null,
      customerId: input.customerId ?? null,
      subscriptionId: input.subscriptionId ?? null,
      invoiceId: input.invoiceId ?? null,
      status: input.status ?? "PROCESSED",
      errorMessage: input.errorMessage ?? null,
      processedAt: isoOrNull(input.processedAt ?? createdAt),
      createdAt: createdAt.toISOString()
    };
    await this.createEntity("billingWebhookEvents", entity);
    return this.toBillingWebhookEvent(entity as TableEntityResult<Record<string, unknown>>);
  }

  async createUser(input: {
    id: string;
    email: string;
    passwordHash?: string | null;
    name?: string | null;
    role: string;
    complimentaryPro?: boolean;
    billingProvider?: string | null;
    billingCustomerId?: string | null;
    billingSubscriptionId?: string | null;
    billingPriceId?: string | null;
    billingPlanCode?: string;
    billingStatus?: string;
    billingEntitlementStatus?: string;
    billingLastPaymentStatus?: string;
    billingLastInvoiceId?: string | null;
    billingCurrentPeriodEnd?: Date | null;
    billingCancelAtPeriodEnd?: boolean;
    billingLastStripeEventId?: string | null;
    billingLastStripeEventCreatedAt?: Date | null;
    billingLastSubscriptionEventAt?: Date | null;
    billingLastInvoiceEventAt?: Date | null;
    billingUpdatedAt?: Date | null;
    isPaid?: boolean;
    submissionCount?: number;
    extraSubmissionCredits?: number;
    ttsProvider?: string;
    ttsVoice?: string;
    createdAt?: Date;
  }): Promise<AzureTablePrimaryUser> {
    const createdAt = input.createdAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      partitionKey: "user",
      rowKey: input.id,
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash ?? null,
      name: input.name ?? null,
      role: input.role,
      complimentaryPro: input.complimentaryPro ?? false,
      billingProvider: input.billingProvider ?? null,
      billingCustomerId: input.billingCustomerId ?? null,
      billingSubscriptionId: input.billingSubscriptionId ?? null,
      billingPriceId: input.billingPriceId ?? null,
      billingPlanCode: input.billingPlanCode ?? "STARTER",
      billingStatus: input.billingStatus ?? "NONE",
      billingEntitlementStatus: input.billingEntitlementStatus ?? "INACTIVE",
      billingLastPaymentStatus: input.billingLastPaymentStatus ?? "NONE",
      billingLastInvoiceId: input.billingLastInvoiceId ?? null,
      billingCurrentPeriodEnd: isoOrNull(input.billingCurrentPeriodEnd),
      billingCancelAtPeriodEnd: input.billingCancelAtPeriodEnd ?? false,
      billingLastStripeEventId: input.billingLastStripeEventId ?? null,
      billingLastStripeEventCreatedAt: isoOrNull(input.billingLastStripeEventCreatedAt),
      billingLastSubscriptionEventAt: isoOrNull(input.billingLastSubscriptionEventAt),
      billingLastInvoiceEventAt: isoOrNull(input.billingLastInvoiceEventAt),
      billingUpdatedAt: isoOrNull(input.billingUpdatedAt),
      isPaid: input.isPaid ?? false,
      submissionCount: input.submissionCount ?? 0,
      extraSubmissionCredits: input.extraSubmissionCredits ?? 0,
      ttsProvider: input.ttsProvider ?? "kokoro",
      ttsVoice: input.ttsVoice ?? "af_heart",
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString()
    };
    await this.createEntity("users", entity);
    return this.toUser(entity as TableEntityResult<Record<string, unknown>>);
  }

  async updateUser(
    userId: string,
    input: Partial<{
      email: string;
      passwordHash: string | null;
      name: string | null;
      role: string;
      complimentaryPro: boolean;
      billingProvider: string | null;
      billingCustomerId: string | null;
      billingSubscriptionId: string | null;
      billingPriceId: string | null;
      billingPlanCode: string;
      billingStatus: string;
      billingEntitlementStatus: string;
      billingLastPaymentStatus: string;
      billingLastInvoiceId: string | null;
      billingCurrentPeriodEnd: Date | null;
      billingCancelAtPeriodEnd: boolean;
      billingLastStripeEventId: string | null;
      billingLastStripeEventCreatedAt: Date | null;
      billingLastSubscriptionEventAt: Date | null;
      billingLastInvoiceEventAt: Date | null;
      billingUpdatedAt: Date | null;
      isPaid: boolean;
      submissionCount: number;
      extraSubmissionCredits: number;
      ttsProvider: string;
      ttsVoice: string;
      firstSeenAt: Date | null;
      firstSeenCountryCode: string | null;
      firstSeenRegionCode: string | null;
      firstSeenCity: string | null;
      lastSeenAt: Date | null;
      lastSeenCountryCode: string | null;
      lastSeenRegionCode: string | null;
      lastSeenCity: string | null;
    }>
  ): Promise<AzureTablePrimaryUser | null> {
    const current = await this.getEntity<Record<string, unknown>>("users", "user", userId);
    if (!current) {
      return null;
    }

    const updatedAt = new Date();
    const next: TableEntity<Record<string, unknown>> = {
      ...current,
      partitionKey: "user",
      rowKey: userId,
      email: input.email ? input.email.toLowerCase() : current.email,
      passwordHash: input.passwordHash === undefined ? current.passwordHash : input.passwordHash,
      name: input.name === undefined ? current.name : input.name,
      role: input.role ?? current.role,
      complimentaryPro: input.complimentaryPro ?? current.complimentaryPro,
      billingProvider: input.billingProvider === undefined ? current.billingProvider : input.billingProvider,
      billingCustomerId: input.billingCustomerId === undefined ? current.billingCustomerId : input.billingCustomerId,
      billingSubscriptionId:
        input.billingSubscriptionId === undefined ? current.billingSubscriptionId : input.billingSubscriptionId,
      billingPriceId: input.billingPriceId === undefined ? current.billingPriceId : input.billingPriceId,
      billingPlanCode: input.billingPlanCode ?? current.billingPlanCode,
      billingStatus: input.billingStatus ?? current.billingStatus,
      billingEntitlementStatus: input.billingEntitlementStatus ?? current.billingEntitlementStatus,
      billingLastPaymentStatus: input.billingLastPaymentStatus ?? current.billingLastPaymentStatus,
      billingLastInvoiceId: input.billingLastInvoiceId === undefined ? current.billingLastInvoiceId : input.billingLastInvoiceId,
      billingCurrentPeriodEnd:
        input.billingCurrentPeriodEnd === undefined ? current.billingCurrentPeriodEnd : isoOrNull(input.billingCurrentPeriodEnd),
      billingCancelAtPeriodEnd: input.billingCancelAtPeriodEnd ?? current.billingCancelAtPeriodEnd,
      billingLastStripeEventId:
        input.billingLastStripeEventId === undefined ? current.billingLastStripeEventId : input.billingLastStripeEventId,
      billingLastStripeEventCreatedAt:
        input.billingLastStripeEventCreatedAt === undefined
          ? current.billingLastStripeEventCreatedAt
          : isoOrNull(input.billingLastStripeEventCreatedAt),
      billingLastSubscriptionEventAt:
        input.billingLastSubscriptionEventAt === undefined
          ? current.billingLastSubscriptionEventAt
          : isoOrNull(input.billingLastSubscriptionEventAt),
      billingLastInvoiceEventAt:
        input.billingLastInvoiceEventAt === undefined ? current.billingLastInvoiceEventAt : isoOrNull(input.billingLastInvoiceEventAt),
      billingUpdatedAt: input.billingUpdatedAt === undefined ? current.billingUpdatedAt : isoOrNull(input.billingUpdatedAt),
      isPaid: input.isPaid ?? current.isPaid,
      submissionCount: input.submissionCount ?? current.submissionCount,
      extraSubmissionCredits: input.extraSubmissionCredits ?? current.extraSubmissionCredits,
      ttsProvider: input.ttsProvider ?? current.ttsProvider,
      ttsVoice: input.ttsVoice ?? current.ttsVoice,
      firstSeenAt: input.firstSeenAt === undefined ? current.firstSeenAt : isoOrNull(input.firstSeenAt),
      firstSeenCountryCode:
        input.firstSeenCountryCode === undefined ? current.firstSeenCountryCode : input.firstSeenCountryCode,
      firstSeenRegionCode: input.firstSeenRegionCode === undefined ? current.firstSeenRegionCode : input.firstSeenRegionCode,
      firstSeenCity: input.firstSeenCity === undefined ? current.firstSeenCity : input.firstSeenCity,
      lastSeenAt: input.lastSeenAt === undefined ? current.lastSeenAt : isoOrNull(input.lastSeenAt),
      lastSeenCountryCode: input.lastSeenCountryCode === undefined ? current.lastSeenCountryCode : input.lastSeenCountryCode,
      lastSeenRegionCode: input.lastSeenRegionCode === undefined ? current.lastSeenRegionCode : input.lastSeenRegionCode,
      lastSeenCity: input.lastSeenCity === undefined ? current.lastSeenCity : input.lastSeenCity,
      updatedAt: updatedAt.toISOString()
    };

    const success = await this.updateEntity("users", next, current.etag);
    if (!success) {
      return this.findUserById(userId);
    }
    return this.toUser(next as TableEntityResult<Record<string, unknown>>);
  }

  async deleteUser(userId: string): Promise<void> {
    await this.deleteEntity("users", "user", userId);
  }

  async createSession(input: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    createdAt?: Date;
  }): Promise<AzureTablePrimarySession> {
    const createdAt = input.createdAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      partitionKey: "session",
      rowKey: input.tokenHash,
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt.toISOString(),
      createdAt: createdAt.toISOString()
    };
    await this.createEntity("sessions", entity);
    return this.toSession(entity as TableEntityResult<Record<string, unknown>>);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<AzureTablePrimarySession | null> {
    const entity = await this.getEntity<Record<string, unknown>>("sessions", "session", tokenHash);
    return entity ? this.toSession(entity) : null;
  }

  async listSessionsByUser(userId: string): Promise<AzureTablePrimarySession[]> {
    const rows = await this.listEntities<Record<string, unknown>>(
      "sessions",
      joinFilters(filterEquals("PartitionKey", "session"), filterEquals("userId", userId))
    );
    return sortByDateDesc(rows.map((row) => this.toSession(row)), (entry) => entry.createdAt);
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.deleteEntity("sessions", "session", tokenHash);
  }

  async listActiveFeedTokensByUserId(userId: string, kind: "item" | "digest"): Promise<AzureTablePrimaryTokenRow[]> {
    const table = kind === "item" ? "feedTokens" : "digestFeedTokens";
    const entities = await this.listEntities<Record<string, unknown>>(
      table,
      joinFilters(filterEquals("PartitionKey", kind === "item" ? "feed" : "digestFeed"), filterEquals("userId", userId), filterEquals("active", true))
    );
    return sortByDateDesc(entities.map((entity) => this.toTokenRow(entity)), (entry) => entry.createdAt);
  }

  async findActiveFeedTokenByUserId(userId: string, kind: "item" | "digest"): Promise<AzureTablePrimaryTokenRow | null> {
    const rows = await this.listActiveFeedTokensByUserId(userId, kind);
    return rows[0] ?? null;
  }

  async createFeedToken(input: {
    id: string;
    userId: string;
    tokenHash: string;
    tokenValue?: string | null;
    kind: "item" | "digest";
    createdAt?: Date;
  }): Promise<AzureTablePrimaryTokenRow> {
    const createdAt = input.createdAt ?? new Date();
    const table = input.kind === "item" ? "feedTokens" : "digestFeedTokens";
    const partitionKey = input.kind === "item" ? "feed" : "digestFeed";
    const entity: TableEntity<Record<string, unknown>> = {
      partitionKey,
      rowKey: input.id,
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      tokenValue: input.tokenValue ?? null,
      active: true,
      createdAt: createdAt.toISOString(),
      rotatedAt: null
    };
    await this.createEntity(table, entity);
    return this.toTokenRow(entity as TableEntityResult<Record<string, unknown>>);
  }

  async deactivateFeedTokens(userId: string, kind: "item" | "digest", rotatedAt: Date): Promise<number> {
    const table = kind === "item" ? "feedTokens" : "digestFeedTokens";
    const rows = await this.listActiveFeedTokensByUserId(userId, kind);
    await Promise.all(
      rows.map(async (row) => {
        const current = await this.getEntity<Record<string, unknown>>(
          table,
          kind === "item" ? "feed" : "digestFeed",
          row.id
        );
        if (!current) {
          return;
        }
        await this.updateEntity(
          table,
          {
            ...current,
            partitionKey: kind === "item" ? "feed" : "digestFeed",
            rowKey: row.id,
            active: false,
            rotatedAt: rotatedAt.toISOString()
          },
          current.etag
        );
      })
    );
    return rows.length;
  }

  async findFeedTokenByHash(tokenHash: string, kind: "item" | "digest"): Promise<AzureTablePrimaryTokenRow | null> {
    const table = kind === "item" ? "feedTokens" : "digestFeedTokens";
    const partitionKey = kind === "item" ? "feed" : "digestFeed";
    const entity = await this.firstEntity<Record<string, unknown>>(
      table,
      joinFilters(filterEquals("PartitionKey", partitionKey), filterEquals("tokenHash", tokenHash), filterEquals("active", true))
    );
    return entity ? this.toTokenRow(entity) : null;
  }

  async findFeedTokenByValue(tokenValue: string, kind: "item" | "digest"): Promise<AzureTablePrimaryTokenRow | null> {
    const table = kind === "item" ? "feedTokens" : "digestFeedTokens";
    const partitionKey = kind === "item" ? "feed" : "digestFeed";
    const entity = await this.firstEntity<Record<string, unknown>>(
      table,
      joinFilters(filterEquals("PartitionKey", partitionKey), filterEquals("tokenValue", tokenValue), filterEquals("active", true))
    );
    return entity ? this.toTokenRow(entity) : null;
  }

  async countFeedTokens(kind: "item" | "digest" = "item"): Promise<number> {
    const table = kind === "item" ? "feedTokens" : "digestFeedTokens";
    const partitionKey = kind === "item" ? "feed" : "digestFeed";
    const rows = await this.listEntities<Record<string, unknown>>(table, filterEquals("PartitionKey", partitionKey));
    return rows.length;
  }

  async createShareToken(input: {
    id: string;
    userId: string;
    tokenHash: string;
    tokenValue?: string | null;
    scope?: string;
    expiresAt?: Date | null;
    createdAt?: Date;
  }): Promise<AzureTablePrimaryShareTokenRow> {
    const createdAt = input.createdAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      partitionKey: "share",
      rowKey: input.id,
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      tokenValue: input.tokenValue ?? null,
      scope: input.scope ?? "read_only",
      expiresAt: isoOrNull(input.expiresAt ?? null),
      createdAt: createdAt.toISOString()
    };
    await this.createEntity("shareTokens", entity);
    return this.toShareTokenRow(entity as TableEntityResult<Record<string, unknown>>);
  }

  async findShareTokenByHash(tokenHash: string): Promise<AzureTablePrimaryShareTokenRow | null> {
    const entity = await this.firstEntity<Record<string, unknown>>(
      "shareTokens",
      joinFilters(filterEquals("PartitionKey", "share"), filterEquals("tokenHash", tokenHash))
    );
    return entity ? this.toShareTokenRow(entity) : null;
  }

  async findShareTokenById(id: string): Promise<AzureTablePrimaryShareTokenRow | null> {
    const entity = await this.getEntity<Record<string, unknown>>("shareTokens", "share", id);
    return entity ? this.toShareTokenRow(entity) : null;
  }

  async findShareTokenByUserIdAndScope(userId: string, scope: string): Promise<AzureTablePrimaryShareTokenRow | null> {
    const rows = await this.listEntities<Record<string, unknown>>(
      "shareTokens",
      joinFilters(filterEquals("PartitionKey", "share"), filterEquals("userId", userId), filterEquals("scope", scope))
    );
    const shareRows = rows.map((row) => this.toShareTokenRow(row)).sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    return shareRows[0] ?? null;
  }

  async listShareTokensByUserIdAndScopePrefix(userId: string, scopePrefix: string): Promise<AzureTablePrimaryShareTokenRow[]> {
    const rows = await this.listEntities<Record<string, unknown>>(
      "shareTokens",
      joinFilters(filterEquals("PartitionKey", "share"), filterEquals("userId", userId))
    );
    return rows
      .map((row) => this.toShareTokenRow(row))
      .filter((row) => row.scope.startsWith(scopePrefix))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }

  async deleteShareTokensByUserIdAndScope(userId: string, scope: string): Promise<number> {
    const rows = await this.listEntities<Record<string, unknown>>(
      "shareTokens",
      joinFilters(filterEquals("PartitionKey", "share"), filterEquals("userId", userId), filterEquals("scope", scope))
    );
    await Promise.all(rows.map((row) => this.deleteEntity("shareTokens", "share", String(row.rowKey))));
    return rows.length;
  }

  async findOAuthIdentity(provider: string, providerUserId: string): Promise<AzureTablePrimaryOAuthIdentity | null> {
    const entity = await this.getEntity<Record<string, unknown>>(
      "oauthIdentities",
      "oauth",
      `${provider}::${providerUserId}`
    );
    return entity ? this.toOAuthIdentity(entity) : null;
  }

  async listOAuthIdentitiesByUser(userId: string): Promise<AzureTablePrimaryOAuthIdentity[]> {
    const rows = await this.listEntities<Record<string, unknown>>(
      "oauthIdentities",
      joinFilters(filterEquals("PartitionKey", "oauth"), filterEquals("userId", userId))
    );
    return rows.map((row) => this.toOAuthIdentity(row));
  }

  async createOAuthIdentity(input: {
    id: string;
    userId: string;
    provider: string;
    providerUserId: string;
    emailAtLink?: string | null;
    createdAt?: Date;
  }): Promise<AzureTablePrimaryOAuthIdentity> {
    const createdAt = input.createdAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      partitionKey: "oauth",
      rowKey: `${input.provider}::${input.providerUserId}`,
      id: input.id,
      userId: input.userId,
      provider: input.provider,
      providerUserId: input.providerUserId,
      emailAtLink: input.emailAtLink ?? null,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString()
    };
    await this.createEntity("oauthIdentities", entity);
    return this.toOAuthIdentity(entity as TableEntityResult<Record<string, unknown>>);
  }

  async createExtensionConnectCode(input: {
    id: string;
    userId: string;
    codeHash: string;
    label?: string | null;
    expiresAt: Date;
    createdAt?: Date;
  }): Promise<AzureTablePrimaryExtensionConnectCode> {
    const createdAt = input.createdAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      partitionKey: "extCode",
      rowKey: input.codeHash,
      id: input.id,
      userId: input.userId,
      codeHash: input.codeHash,
      label: input.label ?? null,
      expiresAt: input.expiresAt.toISOString(),
      consumedAt: null,
      createdAt: createdAt.toISOString()
    };
    await this.createEntity("extensionConnectCodes", entity);
    return this.toExtensionConnectCode(entity as TableEntityResult<Record<string, unknown>>);
  }

  async findExtensionConnectCodeByHash(codeHash: string): Promise<EntityWithEtag<AzureTablePrimaryExtensionConnectCode> | null> {
    const entity = await this.getEntity<Record<string, unknown>>("extensionConnectCodes", "extCode", codeHash);
    return entity ? { ...this.toExtensionConnectCode(entity), etag: entity.etag } : null;
  }

  async markExtensionConnectCodeConsumed(codeHash: string, consumedAt: Date): Promise<boolean> {
    const current = await this.getEntity<Record<string, unknown>>("extensionConnectCodes", "extCode", codeHash);
    if (!current) {
      return false;
    }
    return this.updateEntity(
      "extensionConnectCodes",
      {
        ...current,
        partitionKey: "extCode",
        rowKey: codeHash,
        consumedAt: consumedAt.toISOString()
      },
      current.etag
    );
  }

  async createExtensionToken(input: {
    id: string;
    userId: string;
    tokenHash: string;
    tokenValue?: string | null;
    label?: string | null;
    scope?: string;
    expiresAt?: Date | null;
    createdAt?: Date;
  }): Promise<AzureTablePrimaryExtensionToken> {
    const createdAt = input.createdAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      partitionKey: "extToken",
      rowKey: input.tokenHash,
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      tokenValue: input.tokenValue ?? null,
      label: input.label ?? null,
      scope: input.scope ?? "ingest:html_snapshot",
      expiresAt: isoOrNull(input.expiresAt ?? null),
      revokedAt: null,
      lastUsedAt: null,
      createdAt: createdAt.toISOString()
    };
    await this.createEntity("extensionTokens", entity);
    return this.toExtensionToken(entity as TableEntityResult<Record<string, unknown>>);
  }

  async findExtensionTokenByHash(tokenHash: string): Promise<EntityWithEtag<AzureTablePrimaryExtensionToken> | null> {
    const entity = await this.getEntity<Record<string, unknown>>("extensionTokens", "extToken", tokenHash);
    return entity ? { ...this.toExtensionToken(entity), etag: entity.etag } : null;
  }

  async touchExtensionTokenLastUsed(tokenHash: string, lastUsedAt: Date): Promise<void> {
    const current = await this.getEntity<Record<string, unknown>>("extensionTokens", "extToken", tokenHash);
    if (!current) {
      return;
    }
    await this.updateEntity(
      "extensionTokens",
      {
        ...current,
        partitionKey: "extToken",
        rowKey: tokenHash,
        lastUsedAt: lastUsedAt.toISOString()
      },
      current.etag
    );
  }

  async revokeExtensionTokensForUser(userId: string, revokedAt: Date): Promise<number> {
    const rows = await this.listEntities<Record<string, unknown>>(
      "extensionTokens",
      // Azure Table rejects `field eq null` filters, so null-state filtering happens client-side.
      joinFilters(filterEquals("PartitionKey", "extToken"), filterEquals("userId", userId))
    );
    const activeRows = rows.filter((row) => hasUnsetDateValue(row.revokedAt));
    await Promise.all(
      activeRows.map((row) =>
        this.updateEntity(
          "extensionTokens",
          {
            ...row,
            partitionKey: "extToken",
            rowKey: String(row.rowKey),
            revokedAt: revokedAt.toISOString()
          },
          row.etag
        )
      )
    );
    return activeRows.length;
  }

  async countExtensionTokens(): Promise<number> {
    const rows = await this.listEntities<Record<string, unknown>>("extensionTokens", filterEquals("PartitionKey", "extToken"));
    return rows.length;
  }

  async findItemById(itemId: string): Promise<AzureTablePrimaryItem | null> {
    const entity = await this.getEntity<Record<string, unknown>>("items", "item", itemId);
    return entity ? this.toItem(entity) : null;
  }

  async listItemsByUser(userId: string, limit = 50): Promise<AzureTablePrimaryItem[]> {
    const rows = await this.listEntities<Record<string, unknown>>(
      "items",
      joinFilters(filterEquals("PartitionKey", "item"), filterEquals("userId", userId))
    );
    return sortByDateDesc(rows.map((row) => this.toItem(row)), (entry) => entry.createdAt).slice(0, limit);
  }

  async countItems(status?: string): Promise<number> {
    const rows = await this.listEntities<Record<string, unknown>>(
      "items",
      joinFilters(filterEquals("PartitionKey", "item"), status ? filterEquals("status", status) : undefined)
    );
    return rows.length;
  }

  async listItemsPage(cursor?: string, limit = 100): Promise<AzureTablePrimaryItem[]> {
    if (limit <= 0) {
      return [];
    }

    const rows = await this.listEntities<Record<string, unknown>>("items", filterEquals("PartitionKey", "item"));
    return rows
      .map((row) => this.toItem(row))
      .sort((left, right) => left.id.localeCompare(right.id))
      .filter((item) => !cursor || item.id > cursor)
      .slice(0, limit);
  }

  async createItem(input: {
    id: string;
    userId: string;
    title?: string | null;
    sourceType: string;
    sourceUrl?: string | null;
    sourceFilePath?: string | null;
    sourceHtml?: string | null;
    sourceCapturedAt?: Date | null;
    status: string;
    priority?: string | null;
    tags?: string[] | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    textHash?: string | null;
    createdAt?: Date;
  }): Promise<AzureTablePrimaryItem> {
    const createdAt = input.createdAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      partitionKey: "item",
      rowKey: input.id,
      userId: input.userId,
      title: input.title ?? null,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl ?? null,
      sourceFilePath: input.sourceFilePath ?? null,
      sourceHtml: input.sourceHtml ?? null,
      sourceCapturedAt: isoOrNull(input.sourceCapturedAt ?? null),
      status: input.status,
      priority: input.priority ?? "LOW",
      tagsJson: serializeItemTags(input.tags),
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      textHash: input.textHash ?? null,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString()
    };
    await this.createEntity("items", entity);
    return this.toItem(entity as TableEntityResult<Record<string, unknown>>);
  }

  async updateItem(
    itemId: string,
    input: Partial<{
      title: string | null;
      sourceUrl: string | null;
      sourceFilePath: string | null;
      sourceHtml: string | null;
      status: string;
      priority: string;
      tags: string[];
      errorCode: string | null;
      errorMessage: string | null;
      textHash: string | null;
      updatedAt: Date;
    }>
  ): Promise<AzureTablePrimaryItem | null> {
    const current = await this.getEntity<Record<string, unknown>>("items", "item", itemId);
    if (!current) {
      return null;
    }
    const updatedAt = input.updatedAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      ...current,
      partitionKey: "item",
      rowKey: itemId,
      title: input.title === undefined ? current.title : input.title,
      sourceUrl: input.sourceUrl === undefined ? current.sourceUrl : input.sourceUrl,
      sourceFilePath: input.sourceFilePath === undefined ? current.sourceFilePath : input.sourceFilePath,
      sourceHtml: input.sourceHtml === undefined ? current.sourceHtml : input.sourceHtml,
      status: input.status ?? current.status,
      priority: input.priority ?? current.priority ?? "LOW",
      tagsJson: input.tags === undefined ? current.tagsJson ?? "[]" : serializeItemTags(input.tags),
      errorCode: input.errorCode === undefined ? current.errorCode : input.errorCode,
      errorMessage: input.errorMessage === undefined ? current.errorMessage : input.errorMessage,
      textHash: input.textHash === undefined ? current.textHash : input.textHash,
      updatedAt: updatedAt.toISOString()
    };
    const success = await this.updateEntity("items", entity, current.etag);
    if (!success) {
      return this.findItemById(itemId);
    }
    return this.toItem(entity as TableEntityResult<Record<string, unknown>>);
  }

  async deleteItem(itemId: string): Promise<void> {
    await this.deleteEntity("items", "item", itemId);
  }

  async deleteJob(jobId: string): Promise<void> {
    await this.deleteEntity("jobs", "job", jobId);
  }

  async deleteJobsByItemId(itemId: string): Promise<number> {
    return this.deleteEntitiesByFilter<Record<string, unknown>>(
      "jobs",
      joinFilters(filterEquals("PartitionKey", "job"), filterEquals("itemId", itemId)) as string,
      "job"
    );
  }

  async createJob(input: {
    id: string;
    itemId: string;
    userId: string;
    attempt?: number;
    status: string;
    lockedAt?: Date | null;
    leaseId?: string | null;
    leaseOwner?: string | null;
    leaseExpiresAt?: Date | null;
    lastHeartbeatAt?: Date | null;
    dispatchMessageId?: string | null;
    scheduledFor?: Date | null;
    nextRetryAt?: Date | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    createdAt?: Date;
  }): Promise<AzureTablePrimaryJob> {
    const createdAt = input.createdAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      partitionKey: "job",
      rowKey: input.id,
      itemId: input.itemId,
      userId: input.userId,
      attempt: input.attempt ?? 0,
      status: input.status,
      lockedAt: isoOrNull(input.lockedAt ?? null),
      leaseId: input.leaseId ?? null,
      leaseOwner: input.leaseOwner ?? null,
      leaseExpiresAt: isoOrNull(input.leaseExpiresAt ?? null),
      lastHeartbeatAt: isoOrNull(input.lastHeartbeatAt ?? null),
      dispatchMessageId: input.dispatchMessageId ?? null,
      scheduledFor: isoOrNull(input.scheduledFor ?? null),
      nextRetryAt: isoOrNull(input.nextRetryAt ?? null),
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString()
    };
    await this.createEntity("jobs", entity);
    return this.toJob(entity as TableEntityResult<Record<string, unknown>>);
  }

  async findJobById(jobId: string): Promise<EntityWithEtag<AzureTablePrimaryJob> | null> {
    const entity = await this.getEntity<Record<string, unknown>>("jobs", "job", jobId);
    return entity ? { ...this.toJob(entity), etag: entity.etag } : null;
  }

  async listJobsByUser(userId: string, limit = 100): Promise<AzureTablePrimaryJob[]> {
    const rows = await this.listEntities<Record<string, unknown>>(
      "jobs",
      joinFilters(filterEquals("PartitionKey", "job"), filterEquals("userId", userId))
    );
    return sortByDateDesc(rows.map((row) => this.toJob(row)), (entry) => entry.createdAt).slice(0, limit);
  }

  async listJobsByItemId(itemId: string): Promise<AzureTablePrimaryJob[]> {
    const rows = await this.listEntities<Record<string, unknown>>(
      "jobs",
      joinFilters(filterEquals("PartitionKey", "job"), filterEquals("itemId", itemId))
    );
    return sortByDateDesc(rows.map((row) => this.toJob(row)), (entry) => entry.createdAt);
  }

  async listJobsByStatus(status: string): Promise<AzureTablePrimaryJob[]> {
    const rows = await this.listEntities<Record<string, unknown>>(
      "jobs",
      joinFilters(filterEquals("PartitionKey", "job"), filterEquals("status", status))
    );
    return rows.map((row) => this.toJob(row));
  }

  async listRecentJobs(limit = 20): Promise<AzureTablePrimaryJob[]> {
    if (limit <= 0) {
      return [];
    }
    const rows = await this.listEntities<Record<string, unknown>>("jobs", filterEquals("PartitionKey", "job"));
    return sortByDateDesc(rows.map((row) => this.toJob(row)), (entry) => entry.createdAt).slice(0, limit);
  }

  async countJobs(input?: {
    status?: string;
    retryableBefore?: Date;
    maxRetryAttempts?: number;
  }): Promise<number> {
    const filters: Array<string | null | undefined> = [filterEquals("PartitionKey", "job")];

    if (input?.status) {
      filters.push(filterEquals("status", input.status));
    }
    if (input?.retryableBefore) {
      filters.push(filterLessThanOrEqual("nextRetryAt", input.retryableBefore));
    }
    if (input?.maxRetryAttempts !== undefined) {
      filters.push(filterLessThan("attempt", input.maxRetryAttempts));
    }

    const rows = await this.listEntities<Record<string, unknown>>("jobs", joinFilters(...filters));
    return rows.length;
  }

  async listStaleJobs(staleBefore: Date): Promise<Array<EntityWithEtag<AzureTablePrimaryJob>>> {
    const rows = await this.listEntities<Record<string, unknown>>(
      "jobs",
      joinFilters(filterEquals("PartitionKey", "job"), filterEquals("status", "PROCESSING"))
    );
    return rows
      .map((row) => ({ ...this.toJob(row), etag: row.etag }))
      .filter((row) => {
        const deadline = jobLeaseDeadline(row);
        return deadline !== null && deadline.getTime() < staleBefore.getTime();
      });
  }

  async countStuckJobs(staleBefore: Date): Promise<number> {
    const rows = await this.listStaleJobs(staleBefore);
    return rows.length;
  }

  async claimJob(input: {
    jobId: string;
    now: Date;
    maxRetryAttempts: number;
    staleProcessingMs?: number;
    leaseId: string;
    leaseOwner: string;
    leaseExpiresAt: Date;
    dispatchMessageId?: string | null;
  }): Promise<EntityWithEtag<AzureTablePrimaryJob> | null> {
    const current = await this.getEntity<Record<string, unknown>>("jobs", "job", input.jobId);
    if (!current) {
      return null;
    }
    const job = this.toJob(current);
    if (!jobEligibleForClaim(job, input.now, input.maxRetryAttempts, input.staleProcessingMs ?? 0)) {
      return null;
    }

    const claimedEntity: TableEntity<Record<string, unknown>> = {
      ...current,
      partitionKey: "job",
      rowKey: input.jobId,
      status: "PROCESSING",
      lockedAt: input.now.toISOString(),
      attempt: job.attempt + 1,
      leaseId: input.leaseId,
      leaseOwner: input.leaseOwner,
      leaseExpiresAt: input.leaseExpiresAt.toISOString(),
      lastHeartbeatAt: input.now.toISOString(),
      dispatchMessageId: input.dispatchMessageId ?? job.dispatchMessageId,
      updatedAt: input.now.toISOString()
    };
    const success = await this.updateEntity("jobs", claimedEntity, current.etag);
    if (!success) {
      return null;
    }
    return {
      ...this.toJob(claimedEntity as TableEntityResult<Record<string, unknown>>),
      etag: undefined
    };
  }

  async listNextEligibleJobs(now: Date, maxRetryAttempts: number, staleProcessingMs = 0): Promise<AzureTablePrimaryJob[]> {
    const queued = await this.listEntities<Record<string, unknown>>(
      "jobs",
      joinFilters(filterEquals("PartitionKey", "job"), filterEquals("status", "QUEUED"))
    );
    const processing = await this.listEntities<Record<string, unknown>>(
      "jobs",
      joinFilters(filterEquals("PartitionKey", "job"), filterEquals("status", "PROCESSING"))
    );
    const retryable = await this.listEntities<Record<string, unknown>>(
      "jobs",
      joinFilters(
        filterEquals("PartitionKey", "job"),
        filterEquals("status", "FAILED"),
        filterLessThan("attempt", maxRetryAttempts),
        filterLessThanOrEqual("nextRetryAt", now)
      )
    );
    return [
      ...queued.map((row) => this.toJob(row)).filter((job) => job.scheduledFor === null || job.scheduledFor.getTime() <= now.getTime()),
      ...retryable.map((row) => this.toJob(row)),
      ...processing.map((row) => this.toJob(row)).filter((job) => jobLeaseExpired(job, now, staleProcessingMs))
    ].sort(
      (left, right) => {
        const leftPrimary =
          left.status === "QUEUED"
            ? (left.scheduledFor ?? left.createdAt).getTime()
            : left.status === "FAILED"
              ? (left.nextRetryAt ?? left.createdAt).getTime()
              : (jobLeaseDeadline(left) ?? left.createdAt).getTime();
        const rightPrimary =
          right.status === "QUEUED"
            ? (right.scheduledFor ?? right.createdAt).getTime()
            : right.status === "FAILED"
              ? (right.nextRetryAt ?? right.createdAt).getTime()
              : (jobLeaseDeadline(right) ?? right.createdAt).getTime();
        if (leftPrimary !== rightPrimary) {
          return leftPrimary - rightPrimary;
        }
        return left.createdAt.getTime() - right.createdAt.getTime();
      }
    );
  }

  async updateJob(
    jobId: string,
    input: Partial<{
      status: string;
      attempt: number;
      lockedAt: Date | null;
      leaseId: string | null;
      leaseOwner: string | null;
      leaseExpiresAt: Date | null;
      lastHeartbeatAt: Date | null;
      dispatchMessageId: string | null;
      scheduledFor: Date | null;
      nextRetryAt: Date | null;
      errorCode: string | null;
      errorMessage: string | null;
      updatedAt: Date;
    }>
  ): Promise<AzureTablePrimaryJob | null> {
    const current = await this.getEntity<Record<string, unknown>>("jobs", "job", jobId);
    if (!current) {
      return null;
    }
    const updatedAt = input.updatedAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      ...current,
      partitionKey: "job",
      rowKey: jobId,
      status: input.status ?? current.status,
      attempt: input.attempt ?? current.attempt,
      lockedAt: input.lockedAt === undefined ? current.lockedAt : isoOrNull(input.lockedAt),
      leaseId: input.leaseId === undefined ? current.leaseId : input.leaseId,
      leaseOwner: input.leaseOwner === undefined ? current.leaseOwner : input.leaseOwner,
      leaseExpiresAt: input.leaseExpiresAt === undefined ? current.leaseExpiresAt : isoOrNull(input.leaseExpiresAt),
      lastHeartbeatAt: input.lastHeartbeatAt === undefined ? current.lastHeartbeatAt : isoOrNull(input.lastHeartbeatAt),
      dispatchMessageId: input.dispatchMessageId === undefined ? current.dispatchMessageId : input.dispatchMessageId,
      scheduledFor: input.scheduledFor === undefined ? current.scheduledFor : isoOrNull(input.scheduledFor),
      nextRetryAt: input.nextRetryAt === undefined ? current.nextRetryAt : isoOrNull(input.nextRetryAt),
      errorCode: input.errorCode === undefined ? current.errorCode : input.errorCode,
      errorMessage: input.errorMessage === undefined ? current.errorMessage : input.errorMessage,
      updatedAt: updatedAt.toISOString()
    };
    const success = await this.updateEntity("jobs", entity, current.etag);
    if (!success) {
      return this.findJobById(jobId).then((row) => (row ? { ...row } : null));
    }
    return this.toJob(entity as TableEntityResult<Record<string, unknown>>);
  }

  async updateJobIfLeaseMatches(
    jobId: string,
    leaseId: string,
    input: Partial<{
      status: string;
      attempt: number;
      lockedAt: Date | null;
      clearLease: boolean;
      leaseOwner: string | null;
      leaseExpiresAt: Date | null;
      lastHeartbeatAt: Date | null;
      dispatchMessageId: string | null;
      scheduledFor: Date | null;
      nextRetryAt: Date | null;
      errorCode: string | null;
      errorMessage: string | null;
      updatedAt: Date;
    }>
  ): Promise<AzureTablePrimaryJob | null> {
    const current = await this.getEntity<Record<string, unknown>>("jobs", "job", jobId);
    if (!current) {
      return null;
    }
    const job = this.toJob(current);
    if (job.leaseId !== leaseId || job.status !== "PROCESSING") {
      return null;
    }
    const updatedAt = input.updatedAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      ...current,
      partitionKey: "job",
      rowKey: jobId,
      status: input.status ?? current.status,
      attempt: input.attempt ?? current.attempt,
      lockedAt: input.lockedAt === undefined ? current.lockedAt : isoOrNull(input.lockedAt),
      leaseId: input.clearLease ? null : leaseId,
      leaseOwner: input.clearLease ? null : input.leaseOwner === undefined ? current.leaseOwner : input.leaseOwner,
      leaseExpiresAt: input.clearLease
        ? null
        : input.leaseExpiresAt === undefined
          ? current.leaseExpiresAt
          : isoOrNull(input.leaseExpiresAt),
      lastHeartbeatAt: input.lastHeartbeatAt === undefined ? current.lastHeartbeatAt : isoOrNull(input.lastHeartbeatAt),
      dispatchMessageId: input.dispatchMessageId === undefined ? current.dispatchMessageId : input.dispatchMessageId,
      scheduledFor: input.scheduledFor === undefined ? current.scheduledFor : isoOrNull(input.scheduledFor),
      nextRetryAt: input.nextRetryAt === undefined ? current.nextRetryAt : isoOrNull(input.nextRetryAt),
      errorCode: input.errorCode === undefined ? current.errorCode : input.errorCode,
      errorMessage: input.errorMessage === undefined ? current.errorMessage : input.errorMessage,
      updatedAt: updatedAt.toISOString()
    };
    const success = await this.updateEntity("jobs", entity, current.etag);
    if (!success) {
      return null;
    }
    return this.toJob(entity as TableEntityResult<Record<string, unknown>>);
  }

  async upsertItemArtifact(input: {
    id: string;
    itemId: string;
    kind: string;
    storageKey: string;
    contentType: string;
    byteLength: number;
    expiresAt?: Date | null;
    createdAt?: Date;
  }): Promise<AzureTablePrimaryItemArtifact> {
    const createdAt = input.createdAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      partitionKey: "artifact",
      rowKey: `${input.itemId}::${input.kind}`,
      id: input.id,
      itemId: input.itemId,
      kind: input.kind,
      storageKey: input.storageKey,
      contentType: input.contentType,
      byteLength: input.byteLength,
      expiresAt: isoOrNull(input.expiresAt ?? null),
      createdAt: createdAt.toISOString()
    };
    await this.upsertEntity("itemArtifacts", entity);
    return this.toItemArtifact(entity as TableEntityResult<Record<string, unknown>>);
  }

  async listItemArtifacts(itemId: string, kind?: string): Promise<AzureTablePrimaryItemArtifact[]> {
    const rows = await this.listEntities<Record<string, unknown>>(
      "itemArtifacts",
      joinFilters(filterEquals("PartitionKey", "artifact"), filterEquals("itemId", itemId), kind ? filterEquals("kind", kind) : undefined)
    );
    return sortByDateDesc(rows.map((row) => this.toItemArtifact(row)), (entry) => entry.createdAt);
  }

  async deleteItemArtifactsByItemId(itemId: string): Promise<number> {
    return this.deleteEntitiesByFilter<Record<string, unknown>>(
      "itemArtifacts",
      joinFilters(filterEquals("PartitionKey", "artifact"), filterEquals("itemId", itemId)) as string,
      "artifact"
    );
  }

  async findChunkCacheByHash(hash: string): Promise<AzureTablePrimaryChunkCache | null> {
    const entity = await this.getEntity<Record<string, unknown>>("chunkCache", "chunk", hash);
    return entity ? this.toChunkCache(entity) : null;
  }

  async createChunkCache(input: {
    id: string;
    itemId: string;
    chunkIndex: number;
    hash: string;
    filePath: string;
    audioBytes: number;
    mimeType: string;
    createdAt?: Date;
  }): Promise<AzureTablePrimaryChunkCache> {
    const createdAt = input.createdAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      partitionKey: "chunk",
      rowKey: input.hash,
      id: input.id,
      itemId: input.itemId,
      chunkIndex: input.chunkIndex,
      hash: input.hash,
      filePath: input.filePath,
      audioBytes: input.audioBytes,
      mimeType: input.mimeType,
      createdAt: createdAt.toISOString()
    };
    await this.createEntity("chunkCache", entity).catch((error: unknown) => {
      if (isConflictError(error)) {
        return undefined;
      }
      throw error;
    });
    return this.toChunkCache(entity as TableEntityResult<Record<string, unknown>>);
  }

  async deleteChunkCachesByItemId(itemId: string): Promise<number> {
    return this.deleteEntitiesByFilter<Record<string, unknown>>(
      "chunkCache",
      joinFilters(filterEquals("PartitionKey", "chunk"), filterEquals("itemId", itemId)) as string,
      "chunk"
    );
  }

  async upsertEpisode(input: {
    id: string;
    itemId: string;
    userId: string;
    guid: string;
    title: string;
    description: string;
    audioPath: string;
    audioBytes: number;
    mimeType: string;
    publishedAt: Date;
    expiresAt?: Date | null;
    createdAt?: Date;
  }): Promise<AzureTablePrimaryEpisode> {
    const createdAt = input.createdAt ?? new Date();
    const existing = await this.findEpisodeByItemId(input.itemId);
    const rowKey = existing?.id ?? input.id;
    const entity: TableEntity<Record<string, unknown>> = {
      partitionKey: "episode",
      rowKey,
      itemId: input.itemId,
      userId: input.userId,
      guid: input.guid,
      title: input.title,
      description: input.description,
      audioPath: input.audioPath,
      audioBytes: input.audioBytes,
      mimeType: input.mimeType,
      publishedAt: input.publishedAt.toISOString(),
      expiresAt: isoOrNull(input.expiresAt ?? null),
      createdAt: existing?.createdAt.toISOString() ?? createdAt.toISOString()
    };
    await this.upsertEntity("episodes", entity);
    return this.toEpisode(entity as TableEntityResult<Record<string, unknown>>);
  }

  async findEpisodeByItemId(itemId: string): Promise<AzureTablePrimaryEpisode | null> {
    const entity = await this.firstEntity<Record<string, unknown>>(
      "episodes",
      joinFilters(filterEquals("PartitionKey", "episode"), filterEquals("itemId", itemId))
    );
    return entity ? this.toEpisode(entity) : null;
  }

  async findEpisodeById(episodeId: string): Promise<AzureTablePrimaryEpisode | null> {
    const entity = await this.getEntity<Record<string, unknown>>("episodes", "episode", episodeId);
    return entity ? this.toEpisode(entity) : null;
  }

  async deleteEpisode(episodeId: string): Promise<void> {
    await this.deleteEntity("episodes", "episode", episodeId);
  }

  async updateEpisode(
    episodeId: string,
    input: Partial<{
      guid: string;
      title: string;
      description: string;
      audioPath: string;
      audioBytes: number;
      mimeType: string;
      publishedAt: Date;
      expiresAt: Date | null;
    }>
  ): Promise<AzureTablePrimaryEpisode | null> {
    const current = await this.getEntity<Record<string, unknown>>("episodes", "episode", episodeId);
    if (!current) {
      return null;
    }
    const entity: TableEntity<Record<string, unknown>> = {
      ...current,
      partitionKey: "episode",
      rowKey: episodeId,
      guid: input.guid ?? current.guid,
      title: input.title ?? current.title,
      description: input.description ?? current.description,
      audioPath: input.audioPath ?? current.audioPath,
      audioBytes: input.audioBytes ?? current.audioBytes,
      mimeType: input.mimeType ?? current.mimeType,
      publishedAt: input.publishedAt ? input.publishedAt.toISOString() : current.publishedAt,
      expiresAt: input.expiresAt === undefined ? current.expiresAt : isoOrNull(input.expiresAt)
    };
    const success = await this.updateEntity("episodes", entity, current.etag);
    if (!success) {
      return this.findEpisodeById(episodeId);
    }
    return this.toEpisode(entity as TableEntityResult<Record<string, unknown>>);
  }

  async listEpisodesForUser(userId: string): Promise<AzureTablePrimaryEpisode[]> {
    const rows = await this.listEntities<Record<string, unknown>>(
      "episodes",
      joinFilters(filterEquals("PartitionKey", "episode"), filterEquals("userId", userId))
    );
    return sortByDateDesc(rows.map((row) => this.toEpisode(row)), (entry) => entry.publishedAt);
  }

  async listAllEpisodes(): Promise<AzureTablePrimaryEpisode[]> {
    const rows = await this.listEntities<Record<string, unknown>>("episodes", filterEquals("PartitionKey", "episode"));
    return sortByDateDesc(rows.map((row) => this.toEpisode(row)), (entry) => entry.publishedAt);
  }

  async countEpisodes(): Promise<number> {
    const rows = await this.listEntities<Record<string, unknown>>("episodes", filterEquals("PartitionKey", "episode"));
    return rows.length;
  }

  async listRecentEpisodes(limit = 200): Promise<AzureTablePrimaryEpisode[]> {
    if (limit <= 0) {
      return [];
    }
    const rows = await this.listEntities<Record<string, unknown>>("episodes", filterEquals("PartitionKey", "episode"));
    return sortByDateDesc(rows.map((row) => this.toEpisode(row)), (entry) => entry.publishedAt).slice(0, limit);
  }

  async findEpisodeByAudioPathForUser(audioPath: string, userId: string): Promise<AzureTablePrimaryEpisode | null> {
    const entity = await this.firstEntity<Record<string, unknown>>(
      "episodes",
      joinFilters(
        filterEquals("PartitionKey", "episode"),
        filterEquals("audioPath", audioPath),
        filterEquals("userId", userId)
      )
    );
    return entity ? this.toEpisode(entity) : null;
  }

  async listDigestRunsByUser(userId: string, limit = 20): Promise<AzureTablePrimaryDigestRun[]> {
    if (limit <= 0) {
      return [];
    }
    const rows = await this.listEntities<Record<string, unknown>>(
      "digestRuns",
      joinFilters(filterEquals("PartitionKey", "digestRun"), filterEquals("userId", userId))
    );
    return sortByTwoDatesDesc(rows.map((row) => this.toDigestRun(row)), (entry) => entry.scheduledFor, (entry) => entry.createdAt).slice(
      0,
      limit
    );
  }

  async listNextEligibleDigestRuns(now: Date, maxRetryAttempts: number): Promise<AzureTablePrimaryDigestRun[]> {
    const queued = await this.listEntities<Record<string, unknown>>(
      "digestRuns",
      joinFilters(filterEquals("PartitionKey", "digestRun"), filterEquals("status", "QUEUED"))
    );
    const retryable = await this.listEntities<Record<string, unknown>>(
      "digestRuns",
      joinFilters(
        filterEquals("PartitionKey", "digestRun"),
        filterEquals("status", "FAILED"),
        filterLessThan("attempt", maxRetryAttempts),
        filterLessThanOrEqual("nextRetryAt", now)
      )
    );
    return sortByTwoDatesDesc(
      [...queued, ...retryable].map((row) => this.toDigestRun(row)),
      (entry) => entry.scheduledFor,
      (entry) => entry.createdAt
    );
  }

  async findDigestSettingsByUserId(userId: string): Promise<AzureTablePrimaryDigestSettings | null> {
    const entity = await this.getEntity<Record<string, unknown>>("digestSettings", "digestSettings", userId);
    return entity ? this.toDigestSettings(entity) : null;
  }

  async upsertDigestSettings(input: {
    id: string;
    userId: string;
    timezone: string;
    dailyEmailEnabled: boolean;
    dailyPodcastEnabled: boolean;
    dailyHour: number;
    dailyMinute: number;
    dailyLengthMinutes: number;
    dailyNextRunAt?: Date | null;
    weeklyEmailEnabled: boolean;
    weeklyPodcastEnabled: boolean;
    weeklyDayOfWeek: number;
    weeklyHour: number;
    weeklyMinute: number;
    weeklyLengthMinutes: number;
    weeklyNextRunAt?: Date | null;
    createdAt?: Date;
  }): Promise<AzureTablePrimaryDigestSettings> {
    const current = await this.getEntity<Record<string, unknown>>("digestSettings", "digestSettings", input.userId);
    const createdAt = current ? parseRequiredDate(current.createdAt, "createdAt") : input.createdAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      partitionKey: "digestSettings",
      rowKey: input.userId,
      id: input.id,
      userId: input.userId,
      timezone: input.timezone,
      dailyEmailEnabled: input.dailyEmailEnabled,
      dailyPodcastEnabled: input.dailyPodcastEnabled,
      dailyHour: input.dailyHour,
      dailyMinute: input.dailyMinute,
      dailyLengthMinutes: input.dailyLengthMinutes,
      dailyNextRunAt: isoOrNull(input.dailyNextRunAt ?? null),
      weeklyEmailEnabled: input.weeklyEmailEnabled,
      weeklyPodcastEnabled: input.weeklyPodcastEnabled,
      weeklyDayOfWeek: input.weeklyDayOfWeek,
      weeklyHour: input.weeklyHour,
      weeklyMinute: input.weeklyMinute,
      weeklyLengthMinutes: input.weeklyLengthMinutes,
      weeklyNextRunAt: isoOrNull(input.weeklyNextRunAt ?? null),
      createdAt: createdAt.toISOString(),
      updatedAt: new Date().toISOString()
    };
    await this.upsertEntity("digestSettings", entity);
    return this.toDigestSettings(entity as TableEntityResult<Record<string, unknown>>);
  }

  async listUsersWithoutDigestSettings(): Promise<AzureTablePrimaryUser[]> {
    const users = await this.listEntities<Record<string, unknown>>("users", joinFilters(filterEquals("PartitionKey", "user")));
    const settings = await this.listEntities<Record<string, unknown>>(
      "digestSettings",
      joinFilters(filterEquals("PartitionKey", "digestSettings"))
    );
    const withSettings = new Set(settings.map((entry) => parseRequiredString(entry.userId, "userId")));
    return users.map((entry) => this.toUser(entry)).filter((user) => !withSettings.has(user.id));
  }

  async listDigestSettings(): Promise<AzureTablePrimaryDigestSettings[]> {
    const rows = await this.listEntities<Record<string, unknown>>(
      "digestSettings",
      joinFilters(filterEquals("PartitionKey", "digestSettings"))
    );
    return rows.map((row) => this.toDigestSettings(row));
  }

  async createDigestRun(input: {
    id: string;
    userId: string;
    cadence: string;
    periodKey: string;
    windowStart: Date;
    windowEnd: Date;
    scheduledFor: Date;
    status: string;
    attempt?: number;
    targetLengthMinutes: number;
    sourceItemCount?: number;
    emailEnabled: boolean;
    podcastEnabled: boolean;
    createdAt?: Date;
  }): Promise<AzureTablePrimaryDigestRun | null> {
    const existing = await this.findDigestRunByUserCadencePeriod(input.userId, input.cadence, input.periodKey);
    if (existing) {
      return null;
    }
    const createdAt = input.createdAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      partitionKey: "digestRun",
      rowKey: input.id,
      userId: input.userId,
      cadence: input.cadence,
      periodKey: input.periodKey,
      windowStart: input.windowStart.toISOString(),
      windowEnd: input.windowEnd.toISOString(),
      scheduledFor: input.scheduledFor.toISOString(),
      status: input.status,
      attempt: input.attempt ?? 0,
      lockedAt: null,
      nextRetryAt: null,
      targetLengthMinutes: input.targetLengthMinutes,
      sourceItemCount: input.sourceItemCount ?? 0,
      summaryStorageKey: null,
      summaryBytes: null,
      summaryProvider: null,
      summaryModel: null,
      summaryDeployment: null,
      summaryInputTokens: null,
      summaryOutputTokens: null,
      emailEnabled: input.emailEnabled,
      emailStatus: null,
      emailSubject: null,
      emailStorageKey: null,
      emailError: null,
      podcastEnabled: input.podcastEnabled,
      podcastStatus: null,
      podcastError: null,
      errorCode: null,
      errorMessage: null,
      completedAt: null,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString()
    };
    await this.createEntity("digestRuns", entity).catch((error: unknown) => {
      if (isConflictError(error)) {
        return undefined;
      }
      throw error;
    });
    return this.toDigestRun(entity as TableEntityResult<Record<string, unknown>>);
  }

  async findDigestRunById(runId: string): Promise<EntityWithEtag<AzureTablePrimaryDigestRun> | null> {
    const entity = await this.getEntity<Record<string, unknown>>("digestRuns", "digestRun", runId);
    return entity ? { ...this.toDigestRun(entity), etag: entity.etag } : null;
  }

  async findDigestRunByUserCadencePeriod(
    userId: string,
    cadence: string,
    periodKey: string
  ): Promise<AzureTablePrimaryDigestRun | null> {
    const entity = await this.firstEntity<Record<string, unknown>>(
      "digestRuns",
      joinFilters(
        filterEquals("PartitionKey", "digestRun"),
        filterEquals("userId", userId),
        filterEquals("cadence", cadence),
        filterEquals("periodKey", periodKey)
      )
    );
    return entity ? this.toDigestRun(entity) : null;
  }

  async listDueDigestSettings(now: Date): Promise<AzureTablePrimaryDigestSettings[]> {
    const daily = await this.listEntities<Record<string, unknown>>(
      "digestSettings",
      joinFilters(filterEquals("PartitionKey", "digestSettings"), filterLessThanOrEqual("dailyNextRunAt", now))
    );
    const weekly = await this.listEntities<Record<string, unknown>>(
      "digestSettings",
      joinFilters(filterEquals("PartitionKey", "digestSettings"), filterLessThanOrEqual("weeklyNextRunAt", now))
    );
    const byUser = new Map<string, AzureTablePrimaryDigestSettings>();
    for (const row of [...daily, ...weekly]) {
      const settings = this.toDigestSettings(row);
      byUser.set(settings.userId, settings);
    }
    return Array.from(byUser.values());
  }

  async listPendingDigestSchedulerTicks(limit = 20): Promise<AzureTablePrimaryDigestSchedulerTick[]> {
    const rows = await this.listEntities<Record<string, unknown>>(
      "digestSchedulerTicks",
      // Azure Table rejects `field eq null` filters, so null-state filtering happens client-side.
      joinFilters(filterEquals("PartitionKey", "digestTick"))
    );
    return sortByDateDesc(
      rows.map((row) => this.toDigestSchedulerTick(row)).filter((tick) => tick.processedAt === null),
      (entry) => entry.requestedAt
    ).slice(0, limit);
  }

  async createDigestSchedulerTick(input: {
    id: string;
    requestedBy: string;
    forceNow: boolean;
    requestedAt?: Date;
  }): Promise<AzureTablePrimaryDigestSchedulerTick> {
    const requestedAt = input.requestedAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      partitionKey: "digestTick",
      rowKey: input.id,
      requestedAt: requestedAt.toISOString(),
      requestedBy: input.requestedBy,
      forceNow: input.forceNow,
      processedAt: null
    };
    await this.createEntity("digestSchedulerTicks", entity);
    return this.toDigestSchedulerTick(entity as TableEntityResult<Record<string, unknown>>);
  }

  async markDigestSchedulerTicksProcessed(ids: string[], processedAt: Date): Promise<void> {
    await Promise.all(
      ids.map(async (id) => {
        const current = await this.getEntity<Record<string, unknown>>("digestSchedulerTicks", "digestTick", id);
        if (!current) {
          return;
        }
        await this.updateEntity(
          "digestSchedulerTicks",
          {
            ...current,
            partitionKey: "digestTick",
            rowKey: id,
            processedAt: processedAt.toISOString()
          },
          current.etag
        );
      })
    );
  }

  async claimDigestRun(runId: string, now: Date, maxRetryAttempts: number): Promise<AzureTablePrimaryDigestRun | null> {
    const current = await this.getEntity<Record<string, unknown>>("digestRuns", "digestRun", runId);
    if (!current) {
      return null;
    }
    const run = this.toDigestRun(current);
    const retryable =
      run.status === "FAILED" &&
      run.attempt < maxRetryAttempts &&
      run.nextRetryAt !== null &&
      run.nextRetryAt.getTime() <= now.getTime();
    if (!(run.status === "QUEUED" || retryable)) {
      return null;
    }
    const entity: TableEntity<Record<string, unknown>> = {
      ...current,
      partitionKey: "digestRun",
      rowKey: runId,
      status: "PROCESSING",
      attempt: run.attempt + 1,
      lockedAt: now.toISOString(),
      errorCode: null,
      errorMessage: null,
      updatedAt: now.toISOString()
    };
    const success = await this.updateEntity("digestRuns", entity, current.etag);
    if (!success) {
      return null;
    }
    return this.toDigestRun(entity as TableEntityResult<Record<string, unknown>>);
  }

  async listStaleDigestRuns(staleBefore: Date): Promise<Array<EntityWithEtag<AzureTablePrimaryDigestRun>>> {
    const rows = await this.listEntities<Record<string, unknown>>(
      "digestRuns",
      joinFilters(filterEquals("PartitionKey", "digestRun"), filterEquals("status", "PROCESSING"), filterLessThan("lockedAt", staleBefore))
    );
    return rows.map((row) => ({ ...this.toDigestRun(row), etag: row.etag }));
  }

  async updateDigestRun(
    runId: string,
    input: Partial<{
      status: string;
      attempt: number;
      lockedAt: Date | null;
      nextRetryAt: Date | null;
      targetLengthMinutes: number;
      sourceItemCount: number;
      summaryStorageKey: string | null;
      summaryBytes: number | null;
      summaryProvider: string | null;
      summaryModel: string | null;
      summaryDeployment: string | null;
      summaryInputTokens: number | null;
      summaryOutputTokens: number | null;
      emailStatus: string | null;
      emailSubject: string | null;
      emailStorageKey: string | null;
      emailError: string | null;
      podcastStatus: string | null;
      podcastError: string | null;
      errorCode: string | null;
      errorMessage: string | null;
      completedAt: Date | null;
      updatedAt: Date;
    }>
  ): Promise<AzureTablePrimaryDigestRun | null> {
    const current = await this.getEntity<Record<string, unknown>>("digestRuns", "digestRun", runId);
    if (!current) {
      return null;
    }
    const updatedAt = input.updatedAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      ...current,
      partitionKey: "digestRun",
      rowKey: runId,
      status: input.status ?? current.status,
      attempt: input.attempt ?? current.attempt,
      lockedAt: input.lockedAt === undefined ? current.lockedAt : isoOrNull(input.lockedAt),
      nextRetryAt: input.nextRetryAt === undefined ? current.nextRetryAt : isoOrNull(input.nextRetryAt),
      targetLengthMinutes: input.targetLengthMinutes ?? current.targetLengthMinutes,
      sourceItemCount: input.sourceItemCount ?? current.sourceItemCount,
      summaryStorageKey: input.summaryStorageKey === undefined ? current.summaryStorageKey : input.summaryStorageKey,
      summaryBytes: input.summaryBytes === undefined ? current.summaryBytes : input.summaryBytes,
      summaryProvider: input.summaryProvider === undefined ? current.summaryProvider : input.summaryProvider,
      summaryModel: input.summaryModel === undefined ? current.summaryModel : input.summaryModel,
      summaryDeployment: input.summaryDeployment === undefined ? current.summaryDeployment : input.summaryDeployment,
      summaryInputTokens: input.summaryInputTokens === undefined ? current.summaryInputTokens : input.summaryInputTokens,
      summaryOutputTokens: input.summaryOutputTokens === undefined ? current.summaryOutputTokens : input.summaryOutputTokens,
      emailStatus: input.emailStatus === undefined ? current.emailStatus : input.emailStatus,
      emailSubject: input.emailSubject === undefined ? current.emailSubject : input.emailSubject,
      emailStorageKey: input.emailStorageKey === undefined ? current.emailStorageKey : input.emailStorageKey,
      emailError: input.emailError === undefined ? current.emailError : input.emailError,
      podcastStatus: input.podcastStatus === undefined ? current.podcastStatus : input.podcastStatus,
      podcastError: input.podcastError === undefined ? current.podcastError : input.podcastError,
      errorCode: input.errorCode === undefined ? current.errorCode : input.errorCode,
      errorMessage: input.errorMessage === undefined ? current.errorMessage : input.errorMessage,
      completedAt: input.completedAt === undefined ? current.completedAt : isoOrNull(input.completedAt),
      updatedAt: updatedAt.toISOString()
    };
    const success = await this.updateEntity("digestRuns", entity, current.etag);
    if (!success) {
      return this.findDigestRunById(runId).then((row) => (row ? { ...row } : null));
    }
    return this.toDigestRun(entity as TableEntityResult<Record<string, unknown>>);
  }

  async deleteDigestRun(runId: string): Promise<void> {
    await this.deleteEntity("digestRuns", "digestRun", runId);
  }

  async upsertDigestEpisode(input: {
    id: string;
    digestRunId: string;
    userId: string;
    guid: string;
    title: string;
    description: string;
    audioPath: string;
    audioBytes: number;
    mimeType: string;
    publishedAt: Date;
    expiresAt?: Date | null;
    createdAt?: Date;
  }): Promise<AzureTablePrimaryDigestEpisode> {
    const existing = await this.findDigestEpisodeByRunId(input.digestRunId);
    const createdAt = input.createdAt ?? new Date();
    const rowKey = existing?.id ?? input.id;
    const entity: TableEntity<Record<string, unknown>> = {
      partitionKey: "digestEpisode",
      rowKey,
      digestRunId: input.digestRunId,
      userId: input.userId,
      guid: input.guid,
      title: input.title,
      description: input.description,
      audioPath: input.audioPath,
      audioBytes: input.audioBytes,
      mimeType: input.mimeType,
      publishedAt: input.publishedAt.toISOString(),
      expiresAt: isoOrNull(input.expiresAt ?? null),
      createdAt: existing?.createdAt.toISOString() ?? createdAt.toISOString()
    };
    await this.upsertEntity("digestEpisodes", entity);
    return this.toDigestEpisode(entity as TableEntityResult<Record<string, unknown>>);
  }

  async findDigestEpisodeByRunId(digestRunId: string): Promise<AzureTablePrimaryDigestEpisode | null> {
    const entity = await this.firstEntity<Record<string, unknown>>(
      "digestEpisodes",
      joinFilters(filterEquals("PartitionKey", "digestEpisode"), filterEquals("digestRunId", digestRunId))
    );
    return entity ? this.toDigestEpisode(entity) : null;
  }

  async findDigestEpisodeById(id: string): Promise<AzureTablePrimaryDigestEpisode | null> {
    const entity = await this.getEntity<Record<string, unknown>>("digestEpisodes", "digestEpisode", id);
    return entity ? this.toDigestEpisode(entity) : null;
  }

  async deleteDigestEpisode(id: string): Promise<void> {
    await this.deleteEntity("digestEpisodes", "digestEpisode", id);
  }

  async updateDigestEpisode(
    id: string,
    input: Partial<{
      guid: string;
      title: string;
      description: string;
      audioPath: string;
      audioBytes: number;
      mimeType: string;
      publishedAt: Date;
      expiresAt: Date | null;
    }>
  ): Promise<AzureTablePrimaryDigestEpisode | null> {
    const current = await this.getEntity<Record<string, unknown>>("digestEpisodes", "digestEpisode", id);
    if (!current) {
      return null;
    }
    const entity: TableEntity<Record<string, unknown>> = {
      ...current,
      partitionKey: "digestEpisode",
      rowKey: id,
      guid: input.guid ?? current.guid,
      title: input.title ?? current.title,
      description: input.description ?? current.description,
      audioPath: input.audioPath ?? current.audioPath,
      audioBytes: input.audioBytes ?? current.audioBytes,
      mimeType: input.mimeType ?? current.mimeType,
      publishedAt: input.publishedAt ? input.publishedAt.toISOString() : current.publishedAt,
      expiresAt: input.expiresAt === undefined ? current.expiresAt : isoOrNull(input.expiresAt)
    };
    const success = await this.updateEntity("digestEpisodes", entity, current.etag);
    if (!success) {
      return this.findDigestEpisodeById(id);
    }
    return this.toDigestEpisode(entity as TableEntityResult<Record<string, unknown>>);
  }

  async listDigestEpisodesForUser(userId: string): Promise<AzureTablePrimaryDigestEpisode[]> {
    const rows = await this.listEntities<Record<string, unknown>>(
      "digestEpisodes",
      joinFilters(filterEquals("PartitionKey", "digestEpisode"), filterEquals("userId", userId))
    );
    return sortByDateDesc(rows.map((row) => this.toDigestEpisode(row)), (entry) => entry.publishedAt);
  }

  async listAllDigestEpisodes(): Promise<AzureTablePrimaryDigestEpisode[]> {
    const rows = await this.listEntities<Record<string, unknown>>("digestEpisodes", filterEquals("PartitionKey", "digestEpisode"));
    return sortByDateDesc(rows.map((row) => this.toDigestEpisode(row)), (entry) => entry.publishedAt);
  }

  async listSummaryRunsByUser(userId: string, limit = 20): Promise<AzureTablePrimarySummaryRun[]> {
    if (limit <= 0) {
      return [];
    }
    const rows = await this.listEntities<Record<string, unknown>>(
      "summaryRuns",
      joinFilters(filterEquals("PartitionKey", "summaryRun"), filterEquals("userId", userId))
    );
    return sortByTwoDatesDesc(rows.map((row) => this.toSummaryRun(row)), (entry) => entry.createdAt, (entry) => entry.updatedAt).slice(0, limit);
  }

  async listNextEligibleSummaryRuns(now: Date, maxRetryAttempts: number): Promise<AzureTablePrimarySummaryRun[]> {
    const queued = await this.listEntities<Record<string, unknown>>(
      "summaryRuns",
      joinFilters(filterEquals("PartitionKey", "summaryRun"), filterEquals("status", "QUEUED"))
    );
    const retryable = await this.listEntities<Record<string, unknown>>(
      "summaryRuns",
      joinFilters(
        filterEquals("PartitionKey", "summaryRun"),
        filterEquals("status", "FAILED"),
        filterLessThan("attempt", maxRetryAttempts),
        filterLessThanOrEqual("nextRetryAt", now)
      )
    );
    return sortByTwoDatesDesc(
      [...queued, ...retryable].map((row) => this.toSummaryRun(row)),
      (entry) => entry.createdAt,
      (entry) => entry.updatedAt
    );
  }

  async createSummaryRun(input: {
    id: string;
    userId: string;
    requestedTitle?: string | null;
    title?: string | null;
    windowStart: Date;
    windowEnd: Date;
    status: string;
    attempt?: number;
    targetLengthMinutes: number;
    selectedItemCount: number;
    podcastEnabled: boolean;
    createdAt?: Date;
  }): Promise<AzureTablePrimarySummaryRun> {
    const createdAt = input.createdAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      partitionKey: "summaryRun",
      rowKey: input.id,
      userId: input.userId,
      requestedTitle: input.requestedTitle ?? null,
      title: input.title ?? null,
      windowStart: input.windowStart.toISOString(),
      windowEnd: input.windowEnd.toISOString(),
      status: input.status,
      attempt: input.attempt ?? 0,
      lockedAt: null,
      nextRetryAt: null,
      targetLengthMinutes: input.targetLengthMinutes,
      selectedItemCount: input.selectedItemCount,
      podcastEnabled: input.podcastEnabled,
      podcastStatus: null,
      podcastError: null,
      summaryStorageKey: null,
      summaryBytes: null,
      summaryProvider: null,
      summaryModel: null,
      summaryDeployment: null,
      summaryInputTokens: null,
      summaryOutputTokens: null,
      fallbackUsed: false,
      errorCode: null,
      errorMessage: null,
      completedAt: null,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString()
    };
    await this.createEntity("summaryRuns", entity);
    return this.toSummaryRun(entity as TableEntityResult<Record<string, unknown>>);
  }

  async findSummaryRunById(runId: string): Promise<EntityWithEtag<AzureTablePrimarySummaryRun> | null> {
    const entity = await this.getEntity<Record<string, unknown>>("summaryRuns", "summaryRun", runId);
    return entity ? { ...this.toSummaryRun(entity), etag: entity.etag } : null;
  }

  async listStaleSummaryRuns(staleBefore: Date): Promise<Array<EntityWithEtag<AzureTablePrimarySummaryRun>>> {
    const rows = await this.listEntities<Record<string, unknown>>(
      "summaryRuns",
      joinFilters(filterEquals("PartitionKey", "summaryRun"), filterEquals("status", "PROCESSING"), filterLessThan("lockedAt", staleBefore))
    );
    return rows.map((row) => ({ ...this.toSummaryRun(row), etag: row.etag }));
  }

  async claimSummaryRun(runId: string, now: Date, maxRetryAttempts: number): Promise<AzureTablePrimarySummaryRun | null> {
    const current = await this.getEntity<Record<string, unknown>>("summaryRuns", "summaryRun", runId);
    if (!current) {
      return null;
    }
    const run = this.toSummaryRun(current);
    const retryable =
      run.status === "FAILED" &&
      run.attempt < maxRetryAttempts &&
      run.nextRetryAt !== null &&
      run.nextRetryAt.getTime() <= now.getTime();
    if (!(run.status === "QUEUED" || retryable)) {
      return null;
    }

    const entity: TableEntity<Record<string, unknown>> = {
      ...current,
      partitionKey: "summaryRun",
      rowKey: runId,
      status: "PROCESSING",
      attempt: run.attempt + 1,
      lockedAt: now.toISOString(),
      errorCode: null,
      errorMessage: null,
      updatedAt: now.toISOString()
    };
    const success = await this.updateEntity("summaryRuns", entity, current.etag);
    if (!success) {
      return null;
    }
    return this.toSummaryRun(entity as TableEntityResult<Record<string, unknown>>);
  }

  async updateSummaryRun(
    runId: string,
    input: Partial<{
      requestedTitle: string | null;
      title: string | null;
      status: string;
      attempt: number;
      lockedAt: Date | null;
      nextRetryAt: Date | null;
      targetLengthMinutes: number;
      selectedItemCount: number;
      podcastEnabled: boolean;
      podcastStatus: string | null;
      podcastError: string | null;
      summaryStorageKey: string | null;
      summaryBytes: number | null;
      summaryProvider: string | null;
      summaryModel: string | null;
      summaryDeployment: string | null;
      summaryInputTokens: number | null;
      summaryOutputTokens: number | null;
      fallbackUsed: boolean;
      errorCode: string | null;
      errorMessage: string | null;
      completedAt: Date | null;
      updatedAt: Date;
    }>
  ): Promise<AzureTablePrimarySummaryRun | null> {
    const current = await this.getEntity<Record<string, unknown>>("summaryRuns", "summaryRun", runId);
    if (!current) {
      return null;
    }
    const updatedAt = input.updatedAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      ...current,
      partitionKey: "summaryRun",
      rowKey: runId,
      requestedTitle: input.requestedTitle === undefined ? current.requestedTitle : input.requestedTitle,
      title: input.title === undefined ? current.title : input.title,
      status: input.status ?? current.status,
      attempt: input.attempt ?? current.attempt,
      lockedAt: input.lockedAt === undefined ? current.lockedAt : isoOrNull(input.lockedAt),
      nextRetryAt: input.nextRetryAt === undefined ? current.nextRetryAt : isoOrNull(input.nextRetryAt),
      targetLengthMinutes: input.targetLengthMinutes ?? current.targetLengthMinutes,
      selectedItemCount: input.selectedItemCount ?? current.selectedItemCount,
      podcastEnabled: input.podcastEnabled ?? current.podcastEnabled,
      podcastStatus: input.podcastStatus === undefined ? current.podcastStatus : input.podcastStatus,
      podcastError: input.podcastError === undefined ? current.podcastError : input.podcastError,
      summaryStorageKey: input.summaryStorageKey === undefined ? current.summaryStorageKey : input.summaryStorageKey,
      summaryBytes: input.summaryBytes === undefined ? current.summaryBytes : input.summaryBytes,
      summaryProvider: input.summaryProvider === undefined ? current.summaryProvider : input.summaryProvider,
      summaryModel: input.summaryModel === undefined ? current.summaryModel : input.summaryModel,
      summaryDeployment: input.summaryDeployment === undefined ? current.summaryDeployment : input.summaryDeployment,
      summaryInputTokens: input.summaryInputTokens === undefined ? current.summaryInputTokens : input.summaryInputTokens,
      summaryOutputTokens: input.summaryOutputTokens === undefined ? current.summaryOutputTokens : input.summaryOutputTokens,
      fallbackUsed: input.fallbackUsed === undefined ? current.fallbackUsed : input.fallbackUsed,
      errorCode: input.errorCode === undefined ? current.errorCode : input.errorCode,
      errorMessage: input.errorMessage === undefined ? current.errorMessage : input.errorMessage,
      completedAt: input.completedAt === undefined ? current.completedAt : isoOrNull(input.completedAt),
      updatedAt: updatedAt.toISOString()
    };
    const success = await this.updateEntity("summaryRuns", entity, current.etag);
    if (!success) {
      return this.findSummaryRunById(runId).then((row) => (row ? { ...row } : null));
    }
    return this.toSummaryRun(entity as TableEntityResult<Record<string, unknown>>);
  }

  async deleteSummaryRun(runId: string): Promise<void> {
    await this.deleteEntity("summaryRuns", "summaryRun", runId);
  }

  async createSummaryRunItem(input: {
    id: string;
    summaryRunId: string;
    itemId: string;
    orderIndex: number;
    createdAt?: Date;
  }): Promise<AzureTablePrimarySummaryRunItem> {
    const createdAt = input.createdAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      partitionKey: "summaryRunItem",
      rowKey: `${input.summaryRunId}::${input.itemId}`,
      id: input.id,
      summaryRunId: input.summaryRunId,
      itemId: input.itemId,
      orderIndex: input.orderIndex,
      createdAt: createdAt.toISOString()
    };
    await this.upsertEntity("summaryRunItems", entity);
    return this.toSummaryRunItem(entity as TableEntityResult<Record<string, unknown>>);
  }

  async listSummaryRunItems(summaryRunId: string): Promise<AzureTablePrimarySummaryRunItem[]> {
    const rows = await this.listEntities<Record<string, unknown>>(
      "summaryRunItems",
      joinFilters(filterEquals("PartitionKey", "summaryRunItem"), filterEquals("summaryRunId", summaryRunId))
    );
    return [...rows.map((row) => this.toSummaryRunItem(row))].sort((a, b) => a.orderIndex - b.orderIndex || a.itemId.localeCompare(b.itemId));
  }

  async deleteSummaryRunItemsByRunId(summaryRunId: string): Promise<number> {
    return this.deleteEntitiesByFilter<Record<string, unknown>>(
      "summaryRunItems",
      joinFilters(filterEquals("PartitionKey", "summaryRunItem"), filterEquals("summaryRunId", summaryRunId)) as string,
      "summaryRunItem"
    );
  }

  async upsertSummaryEpisode(input: {
    id: string;
    summaryRunId: string;
    userId: string;
    guid: string;
    title: string;
    description: string;
    audioPath: string;
    audioBytes: number;
    mimeType: string;
    publishedAt: Date;
    expiresAt?: Date | null;
    createdAt?: Date;
  }): Promise<AzureTablePrimarySummaryEpisode> {
    const existing = await this.findSummaryEpisodeByRunId(input.summaryRunId);
    const createdAt = input.createdAt ?? new Date();
    const rowKey = existing?.id ?? input.id;
    const entity: TableEntity<Record<string, unknown>> = {
      partitionKey: "summaryEpisode",
      rowKey,
      summaryRunId: input.summaryRunId,
      userId: input.userId,
      guid: input.guid,
      title: input.title,
      description: input.description,
      audioPath: input.audioPath,
      audioBytes: input.audioBytes,
      mimeType: input.mimeType,
      publishedAt: input.publishedAt.toISOString(),
      expiresAt: isoOrNull(input.expiresAt ?? null),
      createdAt: existing?.createdAt.toISOString() ?? createdAt.toISOString()
    };
    await this.upsertEntity("summaryEpisodes", entity);
    return this.toSummaryEpisode(entity as TableEntityResult<Record<string, unknown>>);
  }

  async findSummaryEpisodeByRunId(summaryRunId: string): Promise<AzureTablePrimarySummaryEpisode | null> {
    const entity = await this.firstEntity<Record<string, unknown>>(
      "summaryEpisodes",
      joinFilters(filterEquals("PartitionKey", "summaryEpisode"), filterEquals("summaryRunId", summaryRunId))
    );
    return entity ? this.toSummaryEpisode(entity) : null;
  }

  async findSummaryEpisodeById(id: string): Promise<AzureTablePrimarySummaryEpisode | null> {
    const entity = await this.getEntity<Record<string, unknown>>("summaryEpisodes", "summaryEpisode", id);
    return entity ? this.toSummaryEpisode(entity) : null;
  }

  async deleteSummaryEpisode(id: string): Promise<void> {
    await this.deleteEntity("summaryEpisodes", "summaryEpisode", id);
  }

  async updateSummaryEpisode(
    id: string,
    input: Partial<{
      guid: string;
      title: string;
      description: string;
      audioPath: string;
      audioBytes: number;
      mimeType: string;
      publishedAt: Date;
      expiresAt: Date | null;
    }>
  ): Promise<AzureTablePrimarySummaryEpisode | null> {
    const current = await this.getEntity<Record<string, unknown>>("summaryEpisodes", "summaryEpisode", id);
    if (!current) {
      return null;
    }
    const entity: TableEntity<Record<string, unknown>> = {
      ...current,
      partitionKey: "summaryEpisode",
      rowKey: id,
      guid: input.guid ?? current.guid,
      title: input.title ?? current.title,
      description: input.description ?? current.description,
      audioPath: input.audioPath ?? current.audioPath,
      audioBytes: input.audioBytes ?? current.audioBytes,
      mimeType: input.mimeType ?? current.mimeType,
      publishedAt: input.publishedAt ? input.publishedAt.toISOString() : current.publishedAt,
      expiresAt: input.expiresAt === undefined ? current.expiresAt : isoOrNull(input.expiresAt)
    };
    const success = await this.updateEntity("summaryEpisodes", entity, current.etag);
    if (!success) {
      return this.findSummaryEpisodeById(id);
    }
    return this.toSummaryEpisode(entity as TableEntityResult<Record<string, unknown>>);
  }

  async listSummaryEpisodesForUser(userId: string): Promise<AzureTablePrimarySummaryEpisode[]> {
    const rows = await this.listEntities<Record<string, unknown>>(
      "summaryEpisodes",
      joinFilters(filterEquals("PartitionKey", "summaryEpisode"), filterEquals("userId", userId))
    );
    return sortByDateDesc(rows.map((row) => this.toSummaryEpisode(row)), (entry) => entry.publishedAt);
  }

  async findSummaryEpisodeByAudioPathForUser(audioPath: string, userId: string): Promise<AzureTablePrimarySummaryEpisode | null> {
    const entity = await this.firstEntity<Record<string, unknown>>(
      "summaryEpisodes",
      joinFilters(
        filterEquals("PartitionKey", "summaryEpisode"),
        filterEquals("audioPath", audioPath),
        filterEquals("userId", userId)
      )
    );
    return entity ? this.toSummaryEpisode(entity) : null;
  }

  async listAllSummaryEpisodes(): Promise<AzureTablePrimarySummaryEpisode[]> {
    const rows = await this.listEntities<Record<string, unknown>>("summaryEpisodes", filterEquals("PartitionKey", "summaryEpisode"));
    return sortByDateDesc(rows.map((row) => this.toSummaryEpisode(row)), (entry) => entry.publishedAt);
  }

  async findUserDemographicSurvey(userId: string): Promise<AzureTablePrimaryUserDemographicSurvey | null> {
    const entity = await this.getEntity<Record<string, unknown>>("userDemographicSurveys", "survey", userId);
    return entity ? this.toUserDemographicSurvey(entity) : null;
  }

  async upsertUserDemographicSurvey(input: {
    id: string;
    userId: string;
    status: string;
    ageBand?: string | null;
    genderIdentity?: string | null;
    genderSelfDescribe?: string | null;
    completedAt?: Date | null;
    skippedAt?: Date | null;
    deletedAt?: Date | null;
    createdAt?: Date;
  }): Promise<AzureTablePrimaryUserDemographicSurvey> {
    const current = await this.getEntity<Record<string, unknown>>("userDemographicSurveys", "survey", input.userId);
    const createdAt = current ? parseRequiredDate(current.createdAt, "createdAt") : input.createdAt ?? new Date();
    const entity: TableEntity<Record<string, unknown>> = {
      partitionKey: "survey",
      rowKey: input.userId,
      id: input.id,
      userId: input.userId,
      status: input.status,
      ageBand: input.ageBand ?? null,
      genderIdentity: input.genderIdentity ?? null,
      genderSelfDescribe: input.genderSelfDescribe ?? null,
      completedAt: isoOrNull(input.completedAt ?? null),
      skippedAt: isoOrNull(input.skippedAt ?? null),
      deletedAt: isoOrNull(input.deletedAt ?? null),
      createdAt: createdAt.toISOString(),
      updatedAt: new Date().toISOString()
    };
    await this.upsertEntity("userDemographicSurveys", entity);
    return this.toUserDemographicSurvey(entity as TableEntityResult<Record<string, unknown>>);
  }
}
