import { redirect } from "next/navigation";

export default async function LoginAliasPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const params = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(resolvedSearchParams)) {
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
