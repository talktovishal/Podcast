import Image from "next/image";
import Link from "next/link";
import { BRAND_NAME } from "@articlepod/core/src/config/brand";
import { BRAND_ICON_512_PATH } from "@/lib/brand-assets";

type BrandLogoProps = {
  href?: string;
  className?: string;
  showWordmark?: boolean;
  imageClassName?: string;
  wordmarkClassName?: string;
};

export function BrandLogo({
  href = "/",
  className = "",
  showWordmark = true,
  imageClassName = "",
  wordmarkClassName = "",
}: BrandLogoProps) {
  return (
    <Link href={href} className={`inline-flex items-center gap-1 ${className}`}>
      <Image
        src={BRAND_ICON_512_PATH}
        alt={`${BRAND_NAME} logo`}
        width={48}
        height={48}
        priority
        className={imageClassName}
      />
      {showWordmark ? (
        <span className={`text-xl font-semibold tracking-tight text-[var(--ink)] ${wordmarkClassName}`}>
          {BRAND_NAME}
        </span>
      ) : null}
    </Link>
  );
}
