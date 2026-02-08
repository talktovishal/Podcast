import { writeFile } from "node:fs/promises";
import { AppError, errorCodes } from "../errors/codes";
import type { SynthesizeInput, TtsProvider } from "./types";

export class OpenAiTtsProvider implements TtsProvider {
  readonly providerId = "openai";
  readonly outputFormat = "mp3" as const;

  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async synthesizeToFile({ text, voice, outPath }: SynthesizeInput): Promise<void> {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        input: text,
        voice,
        format: "mp3"
      })
    });

    if (!response.ok) {
      throw new AppError(errorCodes.TTS_FAILED, "Remote speech synthesis failed.", 502);
    }

    const arrayBuffer = await response.arrayBuffer();
    await writeFile(outPath, Buffer.from(arrayBuffer));
  }
}
