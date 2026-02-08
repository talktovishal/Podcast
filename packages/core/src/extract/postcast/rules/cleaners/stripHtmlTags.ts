import { TransformRule } from "../engine/ruleTypes";
import { CleanContext } from "../types";

/**
 * Rule: stripHtmlTags
 * Removes XML/HTML tags that might have been left over (e.g. inline SVGs, unescaped tags).
 * Why: TTS shouldn't read <div class="..."> or closing tags.
 * Config: none
 */
export const stripHtmlTags = (): TransformRule<CleanContext> => ({
    id: "stripHtmlTags",
    description: "Removes loose HTML/XML tags",
    async run(input) {
        let text = input.cleanText;

        // Remove things that look like tags <foo ...> or </foo>
        // Be careful not to remove all < and > if they are math, but typically in HTML context they are tags.
        // We assume the text is mostly plain text / markdown now.

        // Pattern: < /? [letter] ... >
        text = text.replace(/<\/?\w+[^>]*>/g, " ");

        return {
            ok: true,
            data: {
                ...input,
                cleanText: text,
            },
        };
    },
});
