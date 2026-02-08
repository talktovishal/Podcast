import { PythonModelTtsProvider } from "./pythonService";

export class KokoroTtsProvider extends PythonModelTtsProvider {
  constructor(baseUrl: string, timeoutMs?: number) {
    super({ providerId: "kokoro", baseUrl, timeoutMs });
  }
}
