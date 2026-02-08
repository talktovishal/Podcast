import { AppError } from "@listenlater/core";
import { NextResponse } from "next/server";

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, { status: 200, ...init });
}

export function fail(message: string, status = 400, code?: string): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error_code: code,
      error_message: message
    },
    { status }
  );
}

export function fromError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return fail(error.userMessage, error.status, error.code);
  }

  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return fail("Unauthorized", 401, "UNAUTHORIZED");
  }

  return fail("Unexpected error", 500, "INTERNAL_ERROR");
}
