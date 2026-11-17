export type WikiSourceKind = "item" | "snippet";
export type WikiBuildMode = "full" | "incremental";

export type WikiPageMeta = {
  path: string;
  slug: string[];
  routePath: string;
  title: string;
  type: string;
  summary: string | null;
  tags: string[];
  sourceIds: string[];
  sourceKind?: WikiSourceKind | null;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  hash: string;
  outgoingLinks: string[];
  backlinks: string[];
  updated: string | null;
  sizeBytes: number;
  storageKey: string;
  searchText: string;
};

export type WikiSourceState = {
  counts: {
    items: number;
    snippets: number;
    total: number;
  };
  hashes: Record<string, string>;
  changedSourceIds: string[];
  deletedSourceIds: string[];
};

export type WikiManifest = {
  version: 1;
  userId: string;
  buildRunId: string;
  generatedAt: string;
  buildMode: WikiBuildMode;
  defaultPagePath: string;
  schema: {
    promptSource: string;
    promptHash: string;
    wrapperVersion: string;
    runtimeVersion: string;
    karpathyPromptPath: string;
  };
  sourceState: WikiSourceState;
  pages: WikiPageMeta[];
};

export type WikiPrepareWorkspaceState = {
  userId: string;
  workspaceDir: string;
  rawDir: string;
  wikiDir: string;
  buildMode: WikiBuildMode;
  buildReason: string;
  promptHash: string;
  promptSourcePath: string;
  changedSourceIds: string[];
  deletedSourceIds: string[];
  totalSources: number;
};

export type WikiPrepareRunState = {
  version: 1;
  runId: string;
  generatedAt: string;
  repoRoot: string;
  workspaces: WikiPrepareWorkspaceState[];
};
