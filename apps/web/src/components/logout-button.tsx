"use client";

import { useRouter } from "next/navigation";

type LogoutButtonProps = {
  className?: string;
};

export function LogoutButton({ className = "w-full rounded-lg border px-3 py-2 text-sm sm:w-auto" }: LogoutButtonProps) {
  const router = useRouter();

  return (
    <button
      className={className}
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
    >
      Logout
    </button>
  );
}
