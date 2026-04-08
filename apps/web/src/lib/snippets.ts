import { randomUUID } from "node:crypto";
import type { CreateSnippetInput, UpdateSnippetInput } from "@articlepod/core";
import { webPrimaryStore, webUsesAzureTablePrimary } from "./metadata-primary-store";
import { prisma } from "./prisma";

export type SnippetListEntry = {
  id: string;
  userId: string;
  sourceUrl: string;
  sourceTitle: string | null;
  selectedText: string;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function compareNewestFirst<T extends { createdAt: Date; updatedAt: Date; id: string }>(a: T, b: T): number {
  return (
    b.createdAt.getTime() - a.createdAt.getTime() ||
    b.updatedAt.getTime() - a.updatedAt.getTime() ||
    a.id.localeCompare(b.id)
  );
}

export async function listSnippetsForUser(userId: string, limit = 100): Promise<SnippetListEntry[]> {
  const normalizedLimit = Math.max(1, Math.min(limit, 200));

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    return webPrimaryStore.listSnippetsByUser(userId, normalizedLimit);
  }

  const snippets = await prisma.snippet.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }, { id: "asc" }],
    take: normalizedLimit
  });

  return snippets;
}

export async function hasSnippetsForUser(userId: string): Promise<boolean> {
  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const snippets = await webPrimaryStore.listSnippetsByUser(userId, 1);
    return snippets.length > 0;
  }

  const snippet = await prisma.snippet.findFirst({
    where: { userId },
    select: { id: true }
  });

  return Boolean(snippet);
}

export async function findSnippetForUser(userId: string, snippetId: string): Promise<SnippetListEntry | null> {
  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const snippet = await webPrimaryStore.findSnippetById(snippetId);
    return snippet && snippet.userId === userId ? snippet : null;
  }

  const snippet = await prisma.snippet.findUnique({
    where: { id: snippetId }
  });
  return snippet && snippet.userId === userId ? snippet : null;
}

export async function createSnippetForUser(userId: string, input: CreateSnippetInput): Promise<SnippetListEntry> {
  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    return webPrimaryStore.createSnippet({
      id: randomUUID(),
      userId,
      sourceUrl: input.sourceUrl,
      sourceTitle: input.sourceTitle ?? null,
      selectedText: input.selectedText,
      comment: input.comment
    });
  }

  return prisma.snippet.create({
    data: {
      userId,
      sourceUrl: input.sourceUrl,
      sourceTitle: input.sourceTitle ?? null,
      selectedText: input.selectedText,
      comment: input.comment
    }
  });
}

export async function updateSnippetForUser(
  userId: string,
  snippetId: string,
  input: UpdateSnippetInput
): Promise<SnippetListEntry | null> {
  const existing = await findSnippetForUser(userId, snippetId);
  if (!existing) {
    return null;
  }

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    return webPrimaryStore.updateSnippet(snippetId, {
      ...(input.comment !== undefined ? { comment: input.comment } : {})
    });
  }

  return prisma.snippet.update({
    where: { id: snippetId },
    data: {
      ...(input.comment !== undefined ? { comment: input.comment } : {})
    }
  });
}

export async function deleteSnippetForUser(userId: string, snippetId: string): Promise<boolean> {
  const existing = await findSnippetForUser(userId, snippetId);
  if (!existing) {
    return false;
  }

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    await webPrimaryStore.deleteSnippet(snippetId);
    return true;
  }

  await prisma.snippet.delete({
    where: { id: snippetId }
  });
  return true;
}

export function mergeSnippetsPreservingNewest(current: SnippetListEntry[], incoming: SnippetListEntry[]): SnippetListEntry[] {
  const byId = new Map(current.map((snippet) => [snippet.id, snippet]));
  for (const snippet of incoming) {
    byId.set(snippet.id, snippet);
  }
  return [...byId.values()].sort(compareNewestFirst);
}
