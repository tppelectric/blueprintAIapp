"use client";

import { TPP_LOGO_PATH } from "@/lib/tpp-branding";

/** Width-focused boxes; logo uses mix-blend-multiply on navy (white in art → transparent). */
const SIZES = {
  hero: "h-[68px] w-[120px]",
  header: "h-14 w-[100px]",
  tool: "h-[52px] w-[80px]",
  compact: "h-9 w-14",
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
      className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-[#0a1628] p-1 ${SIZES[size]} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- public asset */}
      <img
        src={TPP_LOGO_PATH}
        alt="TPP Electric"
        className="h-full w-full object-contain"
        style={{ mixBlendMode: "multiply" }}
      />
    </span>
  );
}
