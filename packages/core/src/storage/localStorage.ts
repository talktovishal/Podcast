import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export class LocalStorageAdapter {
  constructor(private readonly rootDir: string) {}

  async put(relativePath: string, content: Buffer): Promise<{ path: string; bytes: number }> {
    const filePath = join(this.rootDir, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
    return { path: filePath, bytes: content.byteLength };
  }

  resolve(relativePath: string): string {
    return join(this.rootDir, relativePath);
  }

  async head(relativePath: string): Promise<{ bytes: number; path: string }> {
    const full = this.resolve(relativePath);
    const info = await stat(full);
    return { bytes: info.size, path: full };
  }
}
