import { MarketingCta } from "@/components/marketing-cta";
import { MarketingHeader } from "@/components/marketing-header";

export default function MarketingLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <div className="shrink-0 border-b border-[rgba(31,122,90,0.14)] bg-[rgba(247,251,250,0.94)]">
        <div className="container-shell py-2 sm:py-4">
          <MarketingHeader />
        </div>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="container-shell py-4 sm:py-8">{children}</div>
      </main>

      <div className="shrink-0 border-t border-[rgba(31,122,90,0.14)] bg-[rgba(247,251,250,0.96)]">
        <div className="container-shell py-2 sm:py-4">
          <MarketingCta />
        </div>
      </div>
    </div>
  );
}
