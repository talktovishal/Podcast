export type SynthesizeInput = {
  text: string;
  voice: string;
  format: "mp3" | "m4a";
  outPath: string;
};

export interface TtsProvider {
  readonly providerId: string;
  synthesizeToFile(input: SynthesizeInput): Promise<void>;
}
