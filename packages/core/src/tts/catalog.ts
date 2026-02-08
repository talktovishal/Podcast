import type { TtsProviderId } from "./types";

export type TtsVoiceOption = {
  id: string;
  label: string;
  gender?: "male" | "female" | "neutral";
  locale: string;
};

export type TtsProviderOption = {
  id: TtsProviderId;
  label: string;
  summary: string;
  openSource: boolean;
};

export const TTS_PROVIDER_OPTIONS: readonly TtsProviderOption[] = [
  {
    id: "kokoro",
    label: "Kokoro-82M",
    summary: "Open-source Kokoro model via local Python TTS service.",
    openSource: true
  }
];

export const TTS_VOICES_BY_PROVIDER: Readonly<Record<TtsProviderId, readonly TtsVoiceOption[]>> = {
  "mac-say": [
    { id: "Samantha", label: "Samantha", gender: "female", locale: "en-US" },
    { id: "Alex", label: "Alex", gender: "male", locale: "en-US" },
    { id: "Victoria", label: "Victoria", gender: "female", locale: "en-US" },
    { id: "Daniel", label: "Daniel", gender: "male", locale: "en-GB" }
  ],
  kokoro: [
    { id: "af_heart", label: "Heart", gender: "female", locale: "en-US" },
    { id: "af_bella", label: "Bella", gender: "female", locale: "en-US" },
    { id: "af_sarah", label: "Sarah", gender: "female", locale: "en-US" },
    { id: "af_nicole", label: "Nicole", gender: "female", locale: "en-US" },
    { id: "am_adam", label: "Adam", gender: "male", locale: "en-US" },
    { id: "am_michael", label: "Michael", gender: "male", locale: "en-US" },
    { id: "bf_emma", label: "Emma", gender: "female", locale: "en-GB" },
    { id: "bm_george", label: "George", gender: "male", locale: "en-GB" }
  ],
  melo: [
    { id: "EN-Default", label: "Default", locale: "en" },
    { id: "EN-US", label: "US Accent", locale: "en-US" },
    { id: "EN-BR", label: "British Accent", locale: "en-GB" },
    { id: "EN_INDIA", label: "India Accent", locale: "en-IN" },
    { id: "EN-AU", label: "Australia Accent", locale: "en-AU" }
  ],
  openai: [
    { id: "alloy", label: "Alloy", locale: "en" },
    { id: "ash", label: "Ash", locale: "en" },
    { id: "nova", label: "Nova", locale: "en" },
    { id: "sage", label: "Sage", locale: "en" }
  ]
};

export const DEFAULT_TTS_PROVIDER: TtsProviderId = "kokoro";

const DEFAULT_VOICE_BY_PROVIDER: Readonly<Record<TtsProviderId, string>> = {
  "mac-say": "Samantha",
  kokoro: "af_heart",
  melo: "EN-Default",
  openai: "alloy"
};

export function isValidTtsProviderId(value: string): value is TtsProviderId {
  return TTS_PROVIDER_OPTIONS.some((provider) => provider.id === value);
}

export function getDefaultVoiceForProvider(providerId: TtsProviderId): string {
  return DEFAULT_VOICE_BY_PROVIDER[providerId];
}

export function getTtsVoiceOptions(providerId: TtsProviderId): readonly TtsVoiceOption[] {
  return TTS_VOICES_BY_PROVIDER[providerId];
}

export function isValidVoiceForProvider(providerId: TtsProviderId, voice: string): boolean {
  return getTtsVoiceOptions(providerId).some((option) => option.id === voice);
}

export function normalizeTtsSelection(input?: {
  providerId?: string | null;
  voice?: string | null;
}): { providerId: TtsProviderId; voice: string } {
  const requestedProvider = input?.providerId || DEFAULT_TTS_PROVIDER;
  const providerId: TtsProviderId = isValidTtsProviderId(requestedProvider) ? requestedProvider : DEFAULT_TTS_PROVIDER;
  const requestedVoice = input?.voice?.trim() || "";
  const voice = isValidVoiceForProvider(providerId, requestedVoice)
    ? requestedVoice
    : getDefaultVoiceForProvider(providerId);

  return { providerId, voice };
}

export function getTtsCatalog() {
  return {
    providers: TTS_PROVIDER_OPTIONS,
    voicesByProvider: TTS_VOICES_BY_PROVIDER,
    defaults: {
      providerId: DEFAULT_TTS_PROVIDER,
      voiceByProvider: DEFAULT_VOICE_BY_PROVIDER
    }
  };
}
