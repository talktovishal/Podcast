import Link from "next/link";
import { marketingCopy } from "@/lib/marketing-content";

export function MarketingCta() {
  return (
    <footer
      aria-label="Footer call to action"
      className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:gap-3"
    >
      <Link
        href="/"
        className="inline-flex w-full justify-center whitespace-nowrap rounded-lg bg-[var(--ink)] px-3 py-2 text-xs font-semibold text-white sm:px-4 sm:text-sm"
      >
        {marketingCopy.ctaPrimary}
      </Link>
      <Link
        href="/pricing"
        className="inline-flex w-[78%] justify-self-end justify-center whitespace-nowrap rounded-lg border border-[#bfded4] bg-white px-3 py-2 text-xs font-semibold text-[var(--ink)] sm:w-auto sm:px-4 sm:text-sm"
      >
        {marketingCopy.ctaSecondary}
      </Link>
    </footer>
  );
}
