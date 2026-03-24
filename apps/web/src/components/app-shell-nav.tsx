import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";

type AppShellNavKey = "workspace" | "podcast-apps" | "chrome-extension" | "summary" | "feedback" | "settings";

const NAV_ITEMS: ReadonlyArray<{
  key: AppShellNavKey;
  href: string;
  label: string;
  title: string;
}> = [
  { key: "workspace", href: "/app", label: "Episodes", title: "Episodes" },
  { key: "podcast-apps", href: "/app/podcast-apps", label: "Podcast Apps", title: "Podcast Apps" },
  { key: "chrome-extension", href: "/app/chrome-extension", label: "Chrome Extension", title: "Chrome Extension" },
  { key: "summary", href: "/app/summary", label: "Summaries", title: "Summaries" },
  { key: "feedback", href: "/app/feedback", label: "Feedback", title: "Feedback" },
  { key: "settings", href: "/app/settings", label: "Settings", title: "Settings" }
];

const baseItemClass =
  "shrink-0 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35";
const neutralItemClass = `${baseItemClass} text-[var(--ink)] hover:border-slate-300 hover:bg-slate-50`;
const feedbackItemClass = `${baseItemClass} border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-400 hover:bg-emerald-100`;

export function AppShellNav({ current }: { current: AppShellNavKey }) {
  return (
    <nav aria-label="Workspace navigation" className="max-w-full">
      <div className="flex items-center justify-end gap-2 overflow-x-auto pb-1 sm:flex-nowrap sm:pb-0">
        {NAV_ITEMS.filter((item) => item.key !== current).map((item) => {
          const className = item.key === "feedback" ? feedbackItemClass : neutralItemClass;

          return (
            <Link
              key={item.key}
              className={className}
              href={item.href}
              title={item.title}
            >
              {item.label}
            </Link>
          );
        })}
        <LogoutButton
          ariaLabel="Log out"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-[var(--ink)] transition hover:border-slate-300 hover:bg-slate-50"
          title="Log out"
          variant="icon"
        />
      </div>
    </nav>
  );
}
