import Link from "next/link";
import {
  appShellAccentItemClass,
  appShellNeutralItemClass,
} from "@/components/app-shell-button-styles";
import { LogoutButton } from "@/components/logout-button";
import { hasSnippetsForUser } from "@/lib/snippets";

type AppShellNavKey =
  | "workspace"
  | "podcast-apps"
  | "chrome-extension"
  | "snippets"
  | "summary"
  | "feedback"
  | "settings";

const NAV_ITEMS: ReadonlyArray<{
  key: AppShellNavKey;
  href: string;
  label: string;
  title: string;
}> = [
  { key: "workspace", href: "/app", label: "Episodes", title: "Episodes" },
  {
    key: "podcast-apps",
    href: "/app/podcast-apps",
    label: "Podcast Apps",
    title: "Podcast Apps",
  },
  {
    key: "chrome-extension",
    href: "/app/chrome-extension",
    label: "Chrome Extension",
    title: "Chrome Extension",
  },
  {
    key: "snippets",
    href: "/app/snippets",
    label: "Snippets",
    title: "Snippets",
  },
  {
    key: "summary",
    href: "/app/summary",
    label: "Summaries",
    title: "Summaries",
  },
  {
    key: "feedback",
    href: "/app/feedback",
    label: "Feedback",
    title: "Feedback",
  },
  {
    key: "settings",
    href: "/app/settings",
    label: "Settings",
    title: "Settings",
  },
];

const neutralItemClass = appShellNeutralItemClass;
const highlightedItemClass = appShellAccentItemClass;
export async function AppShellNav({
  current,
  userId,
  showSnippets,
}: {
  current: AppShellNavKey;
  userId: string;
  showSnippets?: boolean;
}) {
  const showSnippetsLink = showSnippets ?? (await hasSnippetsForUser(userId));

  return (
    <nav aria-label="Workspace navigation" className="w-full max-w-full">
      <div className="flex flex-wrap items-center justify-start gap-2 md:flex-nowrap md:justify-end md:overflow-x-auto md:pb-1 lg:overflow-visible lg:pb-0">
        {NAV_ITEMS.filter(
          (item) =>
            item.key !== current &&
            (item.key !== "snippets" || showSnippetsLink),
        ).map((item) => {
          const className =
            item.key === "feedback" ? highlightedItemClass : neutralItemClass;

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
