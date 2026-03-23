import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";

type AccountOverflowMenuProps = {
  links: ReadonlyArray<{
    href: string;
    label: string;
  }>;
  label?: string;
};

export function AccountOverflowMenu({ links, label = "Account" }: AccountOverflowMenuProps) {
  return (
    <details className="relative">
      <summary className="flex list-none cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-[var(--ink)] transition hover:border-slate-300 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        {label}
        <svg aria-hidden="true" className="h-4 w-4 text-[var(--muted)]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>

      <div className="absolute right-0 z-20 mt-2 min-w-[12rem] rounded-xl border border-slate-200 bg-white p-2 shadow-[0_18px_50px_rgba(20,38,30,0.12)]">
        <div className="grid gap-1">
          {links.map((link) => (
            <Link
              key={`${link.href}:${link.label}`}
              className="rounded-lg px-3 py-2 text-sm text-[var(--ink)] transition hover:bg-slate-50"
              href={link.href}
            >
              {link.label}
            </Link>
          ))}
          <LogoutButton className="rounded-lg px-3 py-2 text-left text-sm text-[var(--ink)] transition hover:bg-slate-50" />
        </div>
      </div>
    </details>
  );
}
