export type DemoAudioStrategy = "fast" | "native" | "provider";

export function resolveDemoAudioStrategy(input?: {
  ci?: string;
  platform?: NodeJS.Platform;
  runtimeProfile?: string;
}): DemoAudioStrategy {
  const runtimeProfile = input?.runtimeProfile ?? process.env.RUNTIME_PROFILE ?? "";
  const ci = input?.ci ?? process.env.CI ?? "";
  const platform = input?.platform ?? process.platform;

  if (runtimeProfile === "parity" || ci === "true") {
    return "fast";
  }

  if (platform === "darwin") {
    return "native";
  }

  return "provider";
}
