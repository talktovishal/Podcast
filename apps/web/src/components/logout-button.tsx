"use client";

import { useState } from "react";

type LogoutButtonProps = {
  className?: string;
  ariaLabel?: string;
  title?: string;
  variant?: "default" | "icon" | "responsive";
};

export function LogoutButton({
  className = "w-full rounded-lg border px-3 py-2 text-sm sm:w-auto",
  ariaLabel = "Logout",
  title,
  variant = "default",
}: LogoutButtonProps) {
  const [isBusy, setIsBusy] = useState(false);

  const icon = (
    <svg
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H4" />
    </svg>
  );

  return (
    <button
      aria-label={ariaLabel}
      className={className}
      disabled={isBusy}
      title={title}
      type="button"
      onClick={async () => {
        setIsBusy(true);

        try {
          await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
        } finally {
          window.location.assign("/");
        }
      }}
    >
      {variant === "icon" ? (
        icon
      ) : variant === "responsive" ? (
        <>
          {icon}
          <span className="text-sm md:sr-only">Logout</span>
        </>
      ) : (
        "Logout"
      )}
    </button>
  );
}
