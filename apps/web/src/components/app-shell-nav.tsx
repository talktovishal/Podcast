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
  | "wiki"
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
    key: "wiki",
    href: "/app/wiki",
    label: "Wiki",
    title: "Wiki",
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
      strokeWidth="1.5"
      viewBox="0 0 24 24"
    >
      <path d="M16.8617 4.48667L18.5492 2.79917C19.2814 2.06694 20.4686 2.06694 21.2008 2.79917C21.9331 3.53141 21.9331 4.71859 21.2008 5.45083L10.5822 16.0695C10.0535 16.5981 9.40144 16.9868 8.68489 17.2002L6 18L6.79978 15.3151C7.01323 14.5986 7.40185 13.9465 7.93052 13.4178L16.8617 4.48667ZM16.8617 4.48667L19.5 7.12499M18 14V18.75C18 19.9926 16.9926 21 15.75 21H5.25C4.00736 21 3 19.9926 3 18.75V8.24999C3 7.00735 4.00736 5.99999 5.25 5.99999H10" />
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
  compact = false,
  href,
  icon,
  label,
  title,
}: {
  active: boolean;
  compact?: boolean;
  href: string;
  icon: ReactNode;
  label: string;
  title: string;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={
        compact
          ? `${utilityItemClass(active)} h-9 w-9 px-0`
          : utilityItemClass(active)
      }
      href={href}
      title={title}
    >
      {icon}
      <span className={compact ? "sr-only" : "text-sm md:sr-only"}>{label}</span>
    </Link>
  );
}

export function AppShellNav({
  showSnippets = false,
  mobileLeading,
}: {
  showSnippets?: boolean;
  mobileLeading?: ReactNode;
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter(
    (item) => item.key !== "snippets" || showSnippets,
  );

  const primaryItems = items.filter((item) => item.kind === "primary");
  const mobilePrimaryItems = primaryItems.filter(
    (item) =>
      item.key !== "chrome-extension" &&
      item.key !== "snippets",
  );
  const utilityItems = items.filter((item) => item.kind === "utility");

  return (
    <nav aria-label="Workspace navigation" className="w-full">
      <div className="flex flex-col gap-2 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            {mobileLeading}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {utilityItems.map((item) => {
              const active = matchesPath(pathname, item.href);
              const icon =
                item.key === "feedback" ? <FeedbackIcon /> : <SettingsIcon />;

              return (
                <UtilityLink
                  key={item.key}
                  active={active}
                  compact
                  href={item.href}
                  icon={icon}
                  label={item.label}
                  title={item.title}
                />
              );
            })}
            <LogoutButton
              ariaLabel="Log out"
              className={`${utilityItemClass(false)} h-9 w-9 px-0`}
              title="Log out"
              variant="icon"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {mobilePrimaryItems.map((item) => {
            const active = matchesPath(pathname, item.href);

            return (
              <Link
                key={item.key}
                aria-current={active ? "page" : undefined}
                className={`h-9 shrink-0 px-2.5 text-xs sm:px-3 sm:text-sm ${
                  active ? appShellSelectedItemClass : appShellNeutralItemClass
                }`}
                href={item.href}
                title={item.title}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="hidden w-full lg:flex lg:flex-row lg:flex-nowrap lg:items-center lg:justify-end lg:gap-2">
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
