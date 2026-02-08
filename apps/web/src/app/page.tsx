import { redirect } from "next/navigation";
import { getAuthUserFromCookies } from "@/lib/auth";

export default async function HomePage() {
  const user = await getAuthUserFromCookies();
  if (user) {
    redirect("/app");
  }

  redirect("/login");
}
