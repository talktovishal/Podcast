import { TransformRule } from "../engine/ruleTypes";
import { CleanContext } from "../types";

/**
 * Rule: handleTables
 * Replaces table-like text with a short note.
 * Why: tables are hard to narrate cleanly.
 * Config: none
 */
export const handleTables = (): TransformRule<CleanContext> => ({
  id: "handleTables",
  description: "Replaces table-like content with a placeholder",
  async run(input) {
    const lines = input.cleanText.split("\n");
    const out: string[] = [];
    let removed = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes("|") && trimmed.split("|").length > 3) {
        removed = true;
        continue;
      }
      out.push(line);
    }

    const cleanText = removed
      ? `${out.join("\n")}`.replace(/\n{3,}/g, "\n\n")
      : out.join("\n");

    return {
      ok: true,
      data: {
        ...input,
        cleanText,
        notes: removed ? [...input.notes, "Table removed"] : input.notes,
      },
    };
  },
});
