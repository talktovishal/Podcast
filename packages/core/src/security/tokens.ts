import { makeToken, sha256 } from "../utils/hash.js";

export type SecretToken = {
  plain: string;
  hash: string;
};

export function createSecretToken(): SecretToken {
  const plain = makeToken(32);
  return { plain, hash: sha256(plain) };
}

export function hashIncomingToken(token: string): string {
  return sha256(token);
}
