import { BlobServiceClient } from "@azure/storage-blob";
import type { ObjectRange, ObjectStorage, PutObjectOptions, StoredObjectHead } from "./types";

function normalizeKey(key: string): string {
  return key.replace(/^\/+/, "").replace(/\\/g, "/");
}

async function streamToBuffer(stream: NodeJS.ReadableStream | null | undefined): Promise<Buffer> {
  if (!stream) {
    return Buffer.alloc(0);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class AzureBlobObjectStorage implements ObjectStorage {
  readonly backend = "azure_blob" as const;

  private readonly serviceClient: BlobServiceClient;
  private readonly containerName: string;
  private readonly ensureContainerPromise: Promise<void>;

  constructor(input: {
    container: string;
    connectionString?: string;
    accountUrl?: string;
    sasToken?: string;
    createContainerIfMissing?: boolean;
  }) {
    this.containerName = input.container;

    if (input.connectionString) {
      this.serviceClient = BlobServiceClient.fromConnectionString(input.connectionString);
    } else if (input.accountUrl && input.sasToken) {
      const separator = input.accountUrl.includes("?") ? "&" : "?";
      this.serviceClient = new BlobServiceClient(`${input.accountUrl}${separator}${input.sasToken}`);
    } else {
      throw new Error("Azure blob storage requires either connection string or accountUrl + sasToken.");
    }

    const shouldCreate = input.createContainerIfMissing ?? true;
    this.ensureContainerPromise = shouldCreate ? this.serviceClient.getContainerClient(this.containerName).createIfNotExists().then(() => undefined) : Promise.resolve();
  }

  private async getContainerClient() {
    await this.ensureContainerPromise;
    return this.serviceClient.getContainerClient(this.containerName);
  }

  async putObject(key: string, content: Buffer, options?: PutObjectOptions): Promise<StoredObjectHead> {
    const normalizedKey = normalizeKey(key);
    const container = await this.getContainerClient();
    const blockBlob = container.getBlockBlobClient(normalizedKey);
    await blockBlob.uploadData(content, {
      blobHTTPHeaders: options?.contentType ? { blobContentType: options.contentType } : undefined,
      metadata: options?.metadata
    });
    const props = await blockBlob.getProperties();
    return {
      key: normalizedKey,
      bytes: props.contentLength ?? content.byteLength,
      contentType: props.contentType,
      etag: props.etag,
      lastModified: props.lastModified
    };
  }

  async getObject(key: string, range?: ObjectRange): Promise<Buffer> {
    const normalizedKey = normalizeKey(key);
    const container = await this.getContainerClient();
    const blob = container.getBlobClient(normalizedKey);
    const offset = range?.start ?? 0;
    const count = range && range.end !== undefined ? Math.max(0, range.end - range.start + 1) : undefined;
    const response = await blob.download(offset, count);
    return streamToBuffer(response.readableStreamBody);
  }

  async headObject(key: string): Promise<StoredObjectHead> {
    const normalizedKey = normalizeKey(key);
    const container = await this.getContainerClient();
    const blob = container.getBlobClient(normalizedKey);
    const props = await blob.getProperties();
    return {
      key: normalizedKey,
      bytes: props.contentLength ?? 0,
      contentType: props.contentType,
      etag: props.etag,
      lastModified: props.lastModified
    };
  }

  async deleteObject(key: string): Promise<void> {
    const normalizedKey = normalizeKey(key);
    const container = await this.getContainerClient();
    await container.deleteBlob(normalizedKey).catch(() => undefined);
  }
}
