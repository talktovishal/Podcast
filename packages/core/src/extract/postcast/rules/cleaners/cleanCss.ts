import { TransformRule } from "../engine/ruleTypes";
import { CleanContext } from "../types";

/**
 * Rule: cleanCss
 * Formats CSS / Code artifacts for better speech.
 * Why: "var dash dash foo" is better as "variable foo", hex codes need spacing.
 * Config: none
 */
export const cleanCss = (): TransformRule<CleanContext> => ({
    id: "cleanCss",
    description: "Cleans CSS artifacts like hex codes, vars, and comments",
    async run(input) {
        let text = input.cleanText;

        // 1. Remove CSS comments /* ... */
        text = text.replace(/\/\*[\s\S]*?\*\//g, "");

        // 2. Remove lines that appear to be standalone CSS variable definitions or properties
        // e.g. --foundation: #5accd6;
        // e.g. display: block;
        // We look for lines starting with -- or words, containing :, and ending with ;
        text = text.replace(/^\s*(--|[\w-]+)\s*:.*;\s*$/gm, "");

        // 3. Remove CSS-like blocks { ... }
        // We do this iteratively to handle nesting (media queries)
        let changed = true;
        let loopCount = 0;
        while (changed && loopCount < 10) {
            changed = false;
            // Match a selector (optional) followed by { content }
            // We look for content that contains ';', ':', or '--' to identify it as code.
            text = text.replace(/([^{}\n]*)\{([^}]*)\}/g, (match, selector, content) => {
                if (content.includes(";") || content.includes(":") || content.includes("--")) {
                    changed = true;
                    return ""; // Remove the entire block and its selector
                }
                return match; // Keep if it doesn't look like CSS
            });
            loopCount++;
        }

        // 4. Remove leftover @media or @property declarations that might have lost their blocks
        text = text.replace(/@(media|property|keyframes)[^{;]*$/gm, "");

        // 5. Clean up multiple newlines
        text = text.replace(/\n{3,}/g, "\n\n");

        return {
            ok: true,
            data: {
                ...input,
                cleanText: text.trim(),
            },
        };
    },
});
