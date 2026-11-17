import { createSnippetSchema } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromExtensionTokenRequest, getAuthUserFromRequest } from "@/lib/auth";
import { fromError } from "@/lib/http";
import { logger } from "@/lib/logger";
import { enforceSubmitRateLimits, getClientIp } from "@/lib/rate-limit";
import { createSnippetForUser, listSnippetsForUser } from "@/lib/snippets";

function parseLimit(request: NextRequest): number {
  const raw = request.nextUrl.searchParams.get("limit");
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 100;
  }
  return Math.min(parsed, 200);
}

function sourceHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const snippets = await listSnippetsForUser(user.id, parseLimit(request));
    return NextResponse.json({
      ok: true,
      snippets: snippets.map((snippet) => ({
        ...snippet,
        createdAt: snippet.createdAt.toISOString(),
        updatedAt: snippet.updatedAt.toISOString()
      }))
    });
  } catch (error) {
    return fromError(error, {
      requestId: request.headers.get("x-request-id") || undefined,
      route: "/api/snippets"
    });
  }
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const [sessionUser, extensionUser] = await Promise.all([
      getAuthUserFromRequest(request),
      getAuthUserFromExtensionTokenRequest(request)
    ]);
    const user = sessionUser ?? extensionUser;
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const payload = createSnippetSchema.parse(await request.json());
    await enforceSubmitRateLimits(user.id, getClientIp(request));

    const snippet = await createSnippetForUser(user.id, payload);
    await logger.info("Snippet saved", {
      requestId,
      snippetId: snippet.id,
      userId: user.id,
      hasComment: Boolean(payload.comment),
      sourceHost: sourceHost(payload.sourceUrl)
    });

    return NextResponse.json({
      ok: true,
      snippet: {
        ...snippet,
        createdAt: snippet.createdAt.toISOString(),
        updatedAt: snippet.updatedAt.toISOString()
      }
    });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/snippets"
    });
  }
}
