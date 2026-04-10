"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  appShellNeutralItemClass,
  appShellSelectedItemClass,
  appShellUtilityItemClass,
} from "@/components/app-shell-button-styles";
import { LogoutButton } from "@/components/logout-button";

type AppShellNavKey =
  | "workspace"
  | "podcast-apps"
  | "chrome-extension"
  | "snippets"
  | "summary"
  | "feedback"
  | "settings";

type NavItem = {
  key: AppShellNavKey;
  href: string;
  label: string;
  title: string;
  kind: "primary" | "utility";
};

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  {
    key: "workspace",
    href: "/app",
    label: "Episodes",
    title: "Episodes",
    kind: "primary",
  },
  {
    key: "podcast-apps",
    href: "/app/podcast-apps",
    label: "Podcast Apps",
    title: "Podcast Apps",
    kind: "primary",
  },
  {
    key: "chrome-extension",
    href: "/app/chrome-extension",
    label: "Chrome Extension",
    title: "Chrome Extension",
    kind: "primary",
  },
  {
    key: "snippets",
    href: "/app/snippets",
    label: "Snippets",
    title: "Snippets",
    kind: "primary",
  },
  {
    key: "summary",
    href: "/app/summary",
    label: "Summaries",
    title: "Summaries",
    kind: "primary",
  },
  {
    key: "feedback",
    href: "/app/feedback",
    label: "Feedback",
    title: "Feedback",
    kind: "utility",
  },
  {
    key: "settings",
    href: "/app/settings",
    label: "Settings",
    title: "Settings",
    kind: "utility",
  },
];

function matchesPath(pathname: string, href: string) {
  if (href === "/app") {
    return pathname === "/app";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function utilityItemClass(active: boolean) {
  return active
    ? `${appShellSelectedItemClass} ${appShellUtilityItemClass}`
    : `${appShellNeutralItemClass} ${appShellUtilityItemClass}`;
}

function FeedbackIcon() {
  return (
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
      <path d="M7 17.5L3.5 20V6a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H7Z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </svg>
  );
}

function SettingsIcon() {
  return (
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
      <path d="M12 3v3" />
      <path d="M18.364 5.636l-2.122 2.122" />
      <path d="M21 12h-3" />
      <path d="m18.364 18.364-2.122-2.122" />
      <path d="M12 21v-3" />
      <path d="m7.758 16.242-2.122 2.122" />
      <path d="M6 12H3" />
      <path d="m7.758 7.758-2.122-2.122" />
      <circle cx="12" cy="12" r="3.25" />
    </svg>
  );
}

function UtilityLink({
  active,
  href,
  icon,
  label,
  title,
}: {
  active: boolean;
  href: string;
  icon: ReactNode;
  label: string;
  title: string;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={utilityItemClass(active)}
      href={href}
      title={title}
    >
      {icon}
      <span className="text-sm md:sr-only">{label}</span>
    </Link>
  );
}

export function AppShellNav({
  showSnippets = false,
}: {
  showSnippets?: boolean;
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter(
    (item) => item.key !== "snippets" || showSnippets,
  );

  const primaryItems = items.filter((item) => item.kind === "primary");
  const utilityItems = items.filter((item) => item.kind === "utility");

  return (
    <nav
      aria-label="Workspace navigation"
      className="flex w-full flex-col items-start gap-2 lg:flex-row lg:flex-nowrap lg:items-center lg:justify-end"
    >
      <div className="flex w-full flex-wrap items-center justify-start gap-2 lg:w-auto lg:flex-nowrap lg:justify-end">
        {primaryItems.map((item) => {
          const active = matchesPath(pathname, item.href);

          return (
            <Link
              key={item.key}
              aria-current={active ? "page" : undefined}
              className={
                active ? appShellSelectedItemClass : appShellNeutralItemClass
              }
              href={item.href}
              title={item.title}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-end">
        {utilityItems.map((item) => {
          const active = matchesPath(pathname, item.href);
          const icon =
            item.key === "feedback" ? <FeedbackIcon /> : <SettingsIcon />;

          return (
            <UtilityLink
              key={item.key}
              active={active}
              href={item.href}
              icon={icon}
              label={item.label}
              title={item.title}
            />
          );
        })}
        <LogoutButton
          ariaLabel="Log out"
          className={utilityItemClass(false)}
          title="Log out"
          variant="responsive"
        />
      </div>
    </nav>
  );
}
