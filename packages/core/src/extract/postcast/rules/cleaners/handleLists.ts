import { TransformRule } from "../engine/ruleTypes";
import { CleanContext } from "../types";

/**
 * Rule: handleLists
 * Converts bullet lists into readable sentences.
 * Why: TTS reads bullets poorly.
 * Config: none
 */
export const handleLists = (): TransformRule<CleanContext> => ({
  id: "handleLists",
  description: "Converts list items into sentences",
  async run(input) {
    const lines = input.cleanText.split("\n");
    const out: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      const listMatch = trimmed.match(/^([-*]|\d+\.)\s+(.*)$/);
      if (listMatch) {
        out.push(`Item: ${listMatch[2]}`);
      } else {
        out.push(line);
      }
    }

    return {
      ok: true,
      data: {
        ...input,
        cleanText: out.join("\n"),
      },
    };
  },
});
