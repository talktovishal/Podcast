import Image from "next/image";
import Link from "next/link";
import { BRAND_NAME } from "@articlepod/core/src/config/brand";
import { BRAND_ICON_512_PATH } from "@/lib/brand-assets";

type BrandLogoProps = {
  href?: string;
  className?: string;
  showWordmark?: boolean;
};

export function BrandLogo({ href = "/login", className = "", showWordmark = true }: BrandLogoProps) {
  return (
    <Link href={href} className={`inline-flex items-center gap-3 ${className}`}>
      <Image src={BRAND_ICON_512_PATH} alt={`${BRAND_NAME} logo`} width={40} height={40} priority />
      {showWordmark ? <span className="text-xl font-semibold tracking-tight text-[var(--ink)]">{BRAND_NAME}</span> : null}
    </Link>
  );
}
