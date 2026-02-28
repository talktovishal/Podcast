import { PythonModelTtsProvider } from "./pythonService";

export class KokoroTtsProvider extends PythonModelTtsProvider {
  constructor(baseUrl: string, timeoutMs?: number, sidecarSecret?: string) {
    super({ providerId: "kokoro", baseUrl, timeoutMs, sidecarSecret });
  }
}
