import { updateSnippetSchema } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { fromError } from "@/lib/http";
import { deleteSnippetForUser, updateSnippetForUser } from "@/lib/snippets";

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const payload = updateSnippetSchema.parse(await request.json());
    const snippet = await updateSnippetForUser(user.id, context.params.id, payload);
    if (!snippet) {
      return NextResponse.json({ ok: false, error_code: "NOT_FOUND", error_message: "Snippet not found." }, { status: 404 });
    }

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
      requestId: request.headers.get("x-request-id") || undefined,
      route: "/api/snippets/[id]"
    });
  }
}

export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const deleted = await deleteSnippetForUser(user.id, context.params.id);
    if (!deleted) {
      return NextResponse.json({ ok: false, error_code: "NOT_FOUND", error_message: "Snippet not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return fromError(error, {
      requestId: request.headers.get("x-request-id") || undefined,
      route: "/api/snippets/[id]"
    });
  }
}
