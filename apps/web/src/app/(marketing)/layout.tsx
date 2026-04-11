import { MarketingCta } from "@/components/marketing-cta";
import { MarketingHeader } from "@/components/marketing-header";

export default function MarketingLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full flex-col">
      <div className="sticky top-0 z-20 shrink-0 border-b border-[rgba(31,122,90,0.14)] bg-[rgba(247,251,250,0.94)] backdrop-blur">
        <div className="container-shell py-2 sm:py-4">
          <MarketingHeader />
        </div>
      </div>

      <main className="flex-1">
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
