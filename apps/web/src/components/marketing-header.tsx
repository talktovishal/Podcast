import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { marketingNavItems } from "@/lib/marketing-content";

type MarketingHeaderProps = {
  activeHref?: string;
};

export function MarketingHeader({ activeHref }: MarketingHeaderProps) {
  return (
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <BrandLogo />
      <nav aria-label="Primary navigation" className="flex flex-wrap items-center gap-2 text-sm">
        {marketingNavItems.map((item) => {
          const active = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-3 py-1.5 transition ${
                active
                  ? "bg-[var(--ink)] text-white"
                  : "text-[var(--muted)] hover:bg-[#e8f5f0] hover:text-[var(--ink)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
