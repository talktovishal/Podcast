import { StubDigestEmailSender, type DigestEmailSender } from "@articlepod/core";
import { workerEnv } from "./env.js";

let cachedSender: DigestEmailSender | null = null;

export function makeDigestEmailSender(): DigestEmailSender {
  if (cachedSender) {
    return cachedSender;
  }

  switch (workerEnv.digestEmailProvider) {
    case "stub":
    default:
      cachedSender = new StubDigestEmailSender();
      return cachedSender;
  }
}
