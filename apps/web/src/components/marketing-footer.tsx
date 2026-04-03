import Link from "next/link";
import { BRAND_NAME } from "@articlepod/core/src/config/brand";
import { marketingNavItems } from "@/lib/marketing-content";

const footerLinks = [
  { label: "Home", href: "/" },
  ...marketingNavItems,
  { label: "Log in", href: "/login" }
] as const;

export function MarketingFooter() {
  return (
    <footer className="mt-10 border-t border-[rgba(31,122,90,0.12)] pt-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-[var(--ink)]">{BRAND_NAME}</p>
          <p className="max-w-xl text-sm text-[var(--muted)]">
            Turn saved articles and text-based PDFs into a private podcast feed you can hear in the apps you already use.
          </p>
        </div>

        <nav aria-label="Footer navigation" className="flex flex-wrap gap-3 text-sm text-[var(--muted)]">
          {footerLinks.map((item) => (
            <Link key={item.href} href={item.href} className="transition hover:text-[var(--ink)]">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
