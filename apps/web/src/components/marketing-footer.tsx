import React from "react";
import Link from "next/link";
import { BRAND_NAME } from "@articlepod/core/src/config/brand";
import { marketingNavItems } from "@/lib/marketing-content";

export function MarketingFooter() {
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();

  return (
    <footer className="mt-8 rounded-[28px] border border-[rgba(31,122,90,0.1)] bg-[rgba(255,255,255,0.78)] px-5 py-6 shadow-[0_16px_40px_rgba(20,38,30,0.05)] backdrop-blur sm:px-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <p className="text-base font-semibold text-[var(--ink)]">{BRAND_NAME}</p>
          <p className="max-w-md text-sm text-[var(--muted)]">
            Private podcast episodes for saved reading, with weekly podcast and email digest options when you want a recap layer.
          </p>
        </div>

        <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--muted)] sm:justify-end">
          {marketingNavItems.map((item) => (
            <Link key={item.href} href={item.href} className="transition hover:text-[var(--ink)]">
              {item.label}
            </Link>
          ))}
          {contactEmail ? (
            <a href={`mailto:${contactEmail}`} className="transition hover:text-[var(--ink)]">
              Contact
            </a>
          ) : null}
        </nav>
      </div>
    </footer>
  );
}
