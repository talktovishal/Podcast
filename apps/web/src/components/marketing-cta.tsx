import Link from "next/link";
import { marketingCopy } from "@/lib/marketing-content";

export function MarketingCta() {
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <Link href="/login" className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white">
        {marketingCopy.ctaPrimary}
      </Link>
      <Link href="/app" className="rounded-lg border border-[#bfded4] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)]">
        {marketingCopy.ctaSecondary}
      </Link>
    </div>
  );
}
