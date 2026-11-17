"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { marketingNavItems } from "@/lib/marketing-content";

export function MarketingHeader() {
  const pathname = usePathname();

  return (
    <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <BrandLogo
        className="shrink-0"
        imageClassName="h-9 w-9 sm:h-12 sm:w-12"
        wordmarkClassName="text-lg sm:text-xl"
      />
      <nav
        aria-label="Primary navigation"
        className="-mx-1 flex w-[calc(100%+0.5rem)] flex-nowrap items-center gap-1 overflow-x-auto px-1 text-xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:w-auto sm:gap-2 sm:overflow-visible sm:px-0 sm:text-sm"
      >
        {marketingNavItems.map((item) => {
          const active = item.href === pathname;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 transition sm:px-3 sm:py-1.5 ${
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
