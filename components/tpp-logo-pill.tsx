"use client";

import { TPP_LOGO_PATH } from "@/lib/tpp-branding";

const SIZES = {
  hero: "w-28 sm:w-36 md:w-44",
  /** App header: 64px / 80px / 96px at default breakpoints */
  nav: "w-16 max-w-16 md:w-20 md:max-w-20 lg:w-24 lg:max-w-24",
  header: "w-36",
  tool: "w-28",
  compact: "w-24",
} as const;

/** Background-size % auto — tune per variant for visual balance. */
const BG_SIZE: Record<keyof typeof SIZES, string> = {
  hero: "80% auto",
  nav: "80% auto",
  header: "80% auto",
  tool: "80% auto",
  compact: "80% auto",
};

export function TppLogoPill({
  size,
  className = "",
}: {
  size: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="TPP Electric"
      className={`block aspect-square shrink-0 rounded-full bg-[#0d1f3c] shadow-md ring-1 ring-[#E8C84A]/25 ${SIZES[size]} ${className}`}
      style={{
        backgroundColor: "#0d1f3c",
        backgroundImage: `url('${TPP_LOGO_PATH}')`,
        backgroundSize: BG_SIZE[size],
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}
