import { PythonModelTtsProvider } from "./pythonService";

export class MeloTtsProvider extends PythonModelTtsProvider {
  constructor(baseUrl: string, timeoutMs?: number) {
    super({ providerId: "melo", baseUrl, timeoutMs });
  }
}
