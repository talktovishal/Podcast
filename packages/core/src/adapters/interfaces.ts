export interface ExtractorAdapter {
  extractFromUrl(url: string): Promise<{ title: string; text: string }>;
  extractFromPdf(data: Uint8Array): Promise<{ text: string; pages: number }>;
}

export interface StorageAdapter {
  put(path: string, content: Buffer): Promise<{ path: string; bytes: number }>;
  resolve(path: string): string;
  head(path: string): Promise<{ bytes: number; path: string }>;
}

export interface RssBuilder {
  buildFeed(input: unknown): string;
}
