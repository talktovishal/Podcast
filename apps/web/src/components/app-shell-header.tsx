import Image from "next/image";
import Link from "next/link";
import { BRAND_ICON_512_PATH } from "@/lib/brand-assets";
import { AppShellNav } from "@/components/app-shell-nav";
import { WorkspaceBillingSummary } from "@/components/workspace-billing-summary";
import type { BillingAccountSnapshot } from "@/lib/billing-contract";
import { hasSnippetsForUser } from "@/lib/snippets";

export async function AppShellHeader({
  billingConfigured,
  initialBilling,
  sandboxModeActive = false,
  userId,
}: {
  billingConfigured: boolean;
  initialBilling: BillingAccountSnapshot;
  sandboxModeActive?: boolean;
  userId: string;
}) {
  const showSnippets = await hasSnippetsForUser(userId);

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-[rgba(31,122,90,0.16)] bg-[rgba(247,251,250,0.88)] backdrop-blur">
      <div className="container-shell py-3 sm:py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <Link
            aria-label="ArticlePod home"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[rgba(31,122,90,0.16)] bg-white/92 shadow-sm transition hover:border-[rgba(31,122,90,0.28)] hover:bg-white"
            href="/app"
            title="ArticlePod"
          >
            <Image
              alt="ArticlePod"
              height={32}
              priority
              src={BRAND_ICON_512_PATH}
              width={32}
            />
          </Link>

          <div className="shrink-0">
            <WorkspaceBillingSummary
              billingConfigured={billingConfigured}
              initialBilling={initialBilling}
              sandboxModeActive={sandboxModeActive}
              variant="header"
            />
          </div>

          <div className="min-w-0 flex-1">
            <AppShellNav showSnippets={showSnippets} />
          </div>
        </div>
      </div>
    </header>
  );
}
