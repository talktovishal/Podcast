export function sourceTypeBadgeLabel(sourceType: string): string {
  const normalized = sourceType.toUpperCase();
  if (normalized === "HTML_SNAPSHOT") {
    return "Chrome extension";
  }
  if (normalized === "URL") {
    return "URL";
  }
  if (normalized === "PDF") {
    return "PDF";
  }
  return sourceType;
}

export function sourceFallbackLabel(sourceType: string): string {
  const normalized = sourceType.toUpperCase();
  if (normalized === "URL") {
    return "URL source";
  }
  if (normalized === "HTML_SNAPSHOT") {
    return "Captured via Chrome extension";
  }
  if (normalized === "PDF") {
    return "Uploaded PDF";
  }
  return sourceType;
}
