import type { DigestCadence } from "../types/domain";

export type DigestEmailMessage = {
  userId: string;
  toEmail: string;
  cadence: DigestCadence;
  periodKey: string;
  subject: string;
  markdownBody: string;
};

export type DigestEmailResult = {
  status: "STUB_STORED" | "SENT";
  provider: string;
  externalId?: string;
};

export interface DigestEmailSender {
  send(input: DigestEmailMessage): Promise<DigestEmailResult>;
}

export class StubDigestEmailSender implements DigestEmailSender {
  async send(): Promise<DigestEmailResult> {
    return {
      status: "STUB_STORED",
      provider: "stub"
    };
  }
}
