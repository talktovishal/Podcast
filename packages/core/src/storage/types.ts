export type StorageBackendId = "local" | "azure_blob";

export type ObjectRange = {
  start: number;
  end?: number;
};

export type PutObjectOptions = {
  contentType?: string;
  metadata?: Record<string, string>;
};

export type StoredObjectHead = {
  key: string;
  bytes: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
};

export interface ObjectStorage {
  readonly backend: StorageBackendId;
  putObject(key: string, content: Buffer, options?: PutObjectOptions): Promise<StoredObjectHead>;
  getObject(key: string, range?: ObjectRange): Promise<Buffer>;
  headObject(key: string): Promise<StoredObjectHead>;
  deleteObject(key: string): Promise<void>;
}
