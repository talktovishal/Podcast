import Link from "next/link";
import { marketingCopy } from "@/lib/marketing-content";

export function MarketingCta() {
  return (
    <footer aria-label="Footer call to action" className="flex flex-wrap items-center gap-3">
      <Link href="/" className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white">
        {marketingCopy.ctaPrimary}
      </Link>
      <Link
        href="/pricing"
        className="rounded-lg border border-[#bfded4] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)]"
      >
        {marketingCopy.ctaSecondary}
      </Link>
    </footer>
  );
}
