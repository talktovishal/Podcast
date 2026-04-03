import { redirect } from "next/navigation";

export default function LoginAliasPage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(searchParams ?? {})) {
    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        if (value) {
          params.append(key, value);
        }
      }
      continue;
    }

    if (rawValue) {
      params.set(key, rawValue);
    }
  }

  const query = params.toString();
  redirect(query ? `/?${query}` : "/");
}
