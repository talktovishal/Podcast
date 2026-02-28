import { NextRequest } from "next/server";

function trimHeaderValue(value: string | null, maxLength: number): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength)}...`;
}

export function podcastRequestLogMeta(request: NextRequest): Record<string, unknown> {
  return {
    request_id: trimHeaderValue(request.headers.get("x-request-id"), 128),
    method: request.method,
    user_agent: trimHeaderValue(request.headers.get("user-agent"), 256),
    accept_header: trimHeaderValue(request.headers.get("accept"), 256),
    range_header: trimHeaderValue(request.headers.get("range"), 128),
    has_if_range: request.headers.has("if-range")
  };
}
