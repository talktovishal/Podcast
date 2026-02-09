export type TtsProviderId = "mac-say" | "kokoro" | "melo" | "openai";

export type SynthesizeInput = {
  text: string;
  voice: string;
  format: "mp3" | "m4a";
  outPath: string;
  headers?: Record<string, string>;
};

export interface TtsProvider {
  readonly providerId: TtsProviderId;
  readonly outputFormat: "mp3" | "m4a";
  synthesizeToFile(input: SynthesizeInput): Promise<void>;
}
