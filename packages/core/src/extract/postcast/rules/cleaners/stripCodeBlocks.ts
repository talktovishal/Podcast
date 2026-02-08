import { TransformRule } from "../engine/ruleTypes";
import { CleanContext } from "../types";

/**
 * Rule: stripCodeBlocks
 * Replaces code blocks with a spoken placeholder and unwraps inline code.
 * Why: TTS should not read raw code.
 * Config: codeBlockReplacement (string)
 */
export const stripCodeBlocks = ({
  codeBlockReplacement,
}: {
  codeBlockReplacement: string;
}): TransformRule<CleanContext> => ({
  id: "stripCodeBlocks",
  description: "Replaces code blocks and inline code",
  async run(input) {
    let text = input.cleanText;

    const blockPatterns = [
      /```[\s\S]*?```/g,
      /<pre[\s\S]*?<\/pre>/gi,
      /(^|\n)( {4,}.*(?:\n {4,}.*)*)/g,
    ];

    for (const pattern of blockPatterns) {
      text = text.replace(pattern, (match, lead) => {
        const prefix = typeof lead === "string" ? lead : "\n";
        return `${prefix}${codeBlockReplacement}`;
      });
    }

    text = text.replace(/`([^`]+)`/g, "$1");

    return {
      ok: true,
      data: {
        ...input,
        cleanText: text,
        notes: [...input.notes, "Code blocks removed"],
      },
    };
  },
});
