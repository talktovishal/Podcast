"use client";

import { useRouter } from "next/navigation";

type LogoutButtonProps = {
  className?: string;
  ariaLabel?: string;
  title?: string;
  variant?: "default" | "icon";
};

export function LogoutButton({
  className = "w-full rounded-lg border px-3 py-2 text-sm sm:w-auto",
  ariaLabel = "Logout",
  title,
  variant = "default"
}: LogoutButtonProps) {
  const router = useRouter();

  return (
    <button
      aria-label={ariaLabel}
      className={className}
      title={title}
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
    >
      {variant === "icon" ? (
        <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
          <path d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
          <path d="M10 17l5-5-5-5" />
          <path d="M15 12H4" />
        </svg>
      ) : (
        "Logout"
      )}
    </button>
  );
}
