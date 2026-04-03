"use client";

import { useRouter } from "next/navigation";

export function DeleteAccountButton() {
  const router = useRouter();

  return (
    <button
      className="w-full rounded-lg border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)] sm:w-auto"
      onClick={async () => {
        const confirmed = window.confirm("Delete your account and all items?");
        if (!confirmed) return;

        await fetch("/api/account/delete", { method: "DELETE" });
        router.push("/");
        router.refresh();
      }}
    >
      Delete account
    </button>
  );
}
