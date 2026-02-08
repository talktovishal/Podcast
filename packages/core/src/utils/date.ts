export function toRfc2822(date: Date): string {
  return date.toUTCString();
}
