"use client";

import { useRouter } from "next/navigation";

export function DeleteAccountButton() {
  const router = useRouter();

  return (
    <button
      className="rounded-lg border border-[var(--danger)] px-3 py-1.5 text-sm text-[var(--danger)]"
      onClick={async () => {
        const confirmed = window.confirm("Delete your account and all items?");
        if (!confirmed) return;

        await fetch("/api/account/delete", { method: "DELETE" });
        router.push("/login");
        router.refresh();
      }}
    >
      Delete account
    </button>
  );
}
