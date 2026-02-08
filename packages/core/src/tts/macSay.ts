import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { AppError, errorCodes } from "../errors/codes.js";
import type { SynthesizeInput, TtsProvider } from "./types.js";

function runBinary(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} exited with code ${code}`));
      }
    });
  });
}

export class MacSayTtsProvider implements TtsProvider {
  readonly providerId = "mac-say";

  async synthesizeToFile({ text, voice, format, outPath }: SynthesizeInput): Promise<void> {
    const workspace = await mkdtemp(join(tmpdir(), "listenlater-tts-"));
    const intermediate = join(workspace, "speech.aiff");

    try {
      await runBinary("say", ["-v", voice, "-o", intermediate, text]);

      if (format === "mp3") {
        // On many macOS environments MP3 export isn't guaranteed. We convert to M4A fallback when needed.
        try {
          await runBinary("afconvert", [intermediate, "-o", outPath, "-f", "MPG3", "-d", ".mp3"]);
          return;
        } catch {
          await runBinary("afconvert", [intermediate, "-o", outPath, "-f", "m4af", "-d", "aac"]);
          return;
        }
      }

      await runBinary("afconvert", [intermediate, "-o", outPath, "-f", "m4af", "-d", "aac"]);
    } catch (error) {
      throw new AppError(errorCodes.TTS_FAILED, "Audio generation failed. Please retry later.", 500);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }
}
