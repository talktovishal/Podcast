import { createHash, randomBytes } from "node:crypto";

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function makeToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}
