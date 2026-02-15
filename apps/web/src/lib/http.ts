import { AppError, withLogContext } from "@articlepod/core";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { logger } from "@/lib/logger";

type ErrorResponsePayload = {
  ok: false;
  error_code?: string;
  error_message: string;
  retry_recommended?: boolean;
  support_id?: string;
};

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, { status: 200, ...init });
}

function buildFailurePayload(message: string, code?: string, supportId?: string, retryRecommended?: boolean): ErrorResponsePayload {
  return {
    ok: false,
    error_code: code,
    error_message: message,
    ...(retryRecommended === undefined ? {} : { retry_recommended: retryRecommended }),
    ...(supportId ? { support_id: supportId } : {})
  };
}

export function fail(message: string, status = 400, code?: string, supportId?: string, retryRecommended?: boolean): NextResponse {
  return NextResponse.json(buildFailurePayload(message, code, supportId, retryRecommended), { status });
}

export async function fromError(error: unknown, context?: { requestId?: string; route?: string }): Promise<NextResponse> {
  const requestId = context?.requestId ?? randomUUID();
  const route = context?.route;

  if (error instanceof AppError) {
    const supportId = await withLogContext({ request_id: requestId }, async () =>
      logger.error(error.userMessage, {
        route,
        errorCode: error.code,
        status: error.status
      })
    );
    return fail(error.userMessage, error.status, error.code, supportId, error.status >= 500);
  }

  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const path = firstIssue?.path?.join(".") || "input";
    const message = firstIssue?.message ? `${path}: ${firstIssue.message}` : "Invalid input";
    const supportId = await withLogContext({ request_id: requestId }, async () =>
      logger.error(message, {
        route,
        errorCode: "INVALID_INPUT",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          code: issue.code,
          message: issue.message
        }))
      })
    );
    return fail(message, 400, "INVALID_INPUT", supportId, false);
  }

  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    await withLogContext({ request_id: requestId }, async () => logger.warn("Unauthorized request", { route }));
    return fail("Unauthorized", 401, "UNAUTHORIZED", undefined, false);
  }

  const supportId = await withLogContext({ request_id: requestId }, async () =>
    logger.error("Unexpected error", {
      route,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    })
  );
  return fail("Unexpected error", 500, "INTERNAL_ERROR", supportId, true);
}
