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

export function TppLogoPill({
  size,
  className = "",
}: {
  size: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex aspect-square shrink-0 items-center justify-center rounded-lg bg-white p-1.5 shadow-md ring-1 ring-[#E8C84A]/25 ${SIZES[size]} ${className}`}
    >
      <img
        src={TPP_LOGO_PATH}
        alt="TPP Electric"
        width={256}
        height={256}
        decoding="async"
        draggable={false}
        className="h-full w-full object-contain mix-blend-normal filter-none"
      />
    </span>
  );
}
