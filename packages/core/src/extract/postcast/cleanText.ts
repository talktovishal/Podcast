import type { ExtractedArticle } from "./types";
import type { CleanContext } from "./rules/types";
import { runTransforms } from "./rules/engine/pipeline";
import { normalizeWhitespace } from "./rules/cleaners/normalizeWhitespace";
import { removeBoilerplate } from "./rules/cleaners/removeBoilerplate";
import { stripCodeBlocks } from "./rules/cleaners/stripCodeBlocks";
import { stripUrls } from "./rules/cleaners/stripUrls";
import { handleLists } from "./rules/cleaners/handleLists";
import { handleTables } from "./rules/cleaners/handleTables";
import { stripHtmlTags } from "./rules/cleaners/stripHtmlTags";
import { cleanCss } from "./rules/cleaners/cleanCss";

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function estimateMinutes(text: string, wpm = 155): number {
  const words = countWords(text);
  return words / wpm;
}

export async function cleanArticleTextWithPostcastRules(article: ExtractedArticle): Promise<{
  cleanText: string;
  notes: string[];
}> {
  const context: CleanContext = {
    article,
    cleanText: article.text,
    notes: [],
    estimatedMinutes: estimateMinutes(article.text)
  };

  const { data, notes } = await runTransforms(context, [
    normalizeWhitespace(),
    removeBoilerplate(),
    stripCodeBlocks({
      codeBlockReplacement: "Code example omitted. Check the article link in the episode description."
    }),
    stripUrls({ urlReplacement: "Link in description." }),
    handleLists(),
    handleTables(),
    stripHtmlTags(),
    cleanCss()
  ]);

  return {
    cleanText: data.cleanText,
    notes
  };
}
