import { TransformRule } from "../engine/ruleTypes";
import { CleanContext } from "../types";

/**
 * Rule: removeBoilerplate
 * Removes common boilerplate lines (newsletter, copyright, etc.).
 * Why: avoids repetitive outro text.
 * Config: none
 */
export const removeBoilerplate = (): TransformRule<CleanContext> => ({
  id: "removeBoilerplate",
  description: "Removes boilerplate phrases",
  async run(input) {
    const lines = input.cleanText.split(/\n+/);
    const filtered = lines.filter((line) => {
      const lower = line.toLowerCase();
      const bad = [
        "subscribe",
        "newsletter",
        "sign up",
        "copyright",
        "all rights reserved",
        "cookie",
        "privacy policy",
      ];
      return !bad.some((term) => lower.includes(term));
    });

    return {
      ok: true,
      data: {
        ...input,
        cleanText: filtered.join("\n\n"),
      },
    };
  },
});
