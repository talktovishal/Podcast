export type ExtractedArticle = {
  sourceId: string;
  feedUrl: string;
  canonicalUrl: string;
  title: string;
  author?: string;
  publishedAt?: string;
  html: string;
  text: string;
  headings: string[];
  linkCount: number;
  hasCodeBlocks: boolean;
};

export type ExtractResult = {
  article: ExtractedArticle;
};
