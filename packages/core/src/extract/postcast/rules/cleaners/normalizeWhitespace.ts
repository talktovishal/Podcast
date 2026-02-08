import { TransformRule } from "../engine/ruleTypes";
import { CleanContext } from "../types";

/**
 * Rule: normalizeWhitespace
 * Collapses extra whitespace and trims edges.
 * Why: keeps narration smooth and consistent.
 * Config: none
 */
export const normalizeWhitespace = (): TransformRule<CleanContext> => ({
  id: "normalizeWhitespace",
  description: "Normalizes whitespace in clean text",
  async run(input) {
    const cleanText = input.cleanText
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();

    return {
      ok: true,
      data: {
        ...input,
        cleanText,
      },
    };
  },
});
