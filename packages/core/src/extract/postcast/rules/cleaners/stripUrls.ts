import { TransformRule } from "../engine/ruleTypes";
import { CleanContext } from "../types";

/**
 * Rule: stripUrls
 * Replaces URLs with a short spoken placeholder.
 * Why: TTS reading URLs is noisy.
 * Config: urlReplacement (string)
 */
export const stripUrls = ({
  urlReplacement,
}: {
  urlReplacement: string;
}): TransformRule<CleanContext> => ({
  id: "stripUrls",
  description: "Replaces URLs with a spoken placeholder",
  async run(input) {
    const cleanText = input.cleanText.replace(
      /https?:\/\/[^\s)\]]+/g,
      urlReplacement
    );

    return {
      ok: true,
      data: {
        ...input,
        cleanText,
      },
    };
  },
});
