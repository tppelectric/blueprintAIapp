"use client";

import { TPP_LOGO_PATH } from "@/lib/tpp-branding";

const SIZES = {
  hero: "w-28 sm:w-36 md:w-44",
  header: "w-36",
  tool: "w-28",
  compact: "w-24",
} as const;

const PAD = {
  hero: "p-4",
  header: "p-3",
  tool: "p-2",
  compact: "p-1",
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
      className={`flex aspect-square shrink-0 items-center justify-center rounded-full bg-[#0d1f3c] shadow-md ring-1 ring-[#E8C84A]/25 ${SIZES[size]} ${className}`}
    >
      <span
        className={`flex size-full min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-full ${PAD[size]}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- JPG may have baked-in white; dark pill + filter softens edges */}
        <img
          src={TPP_LOGO_PATH}
          alt="TPP Electric"
          className="h-full w-full max-h-full max-w-full object-contain object-center [filter:drop-shadow(0_0_0_transparent)]"
        />
      </span>
    </span>
  );
}
