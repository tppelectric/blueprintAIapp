"use client";

import { TPP_LOGO_PATH } from "@/lib/tpp-branding";

/** Square boxes (w = h) so the logo centers in the pill at every size. */
const SIZES = {
  hero: "h-32 w-32",
  header: "h-24 w-24",
  tool: "h-20 w-20",
  compact: "h-16 w-16",
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
      className={`flex shrink-0 items-center justify-center rounded-xl bg-white p-2 ${SIZES[size]} ${className}`}
    >
      <span className="flex h-full min-h-0 w-full min-w-0 flex-1 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- public asset */}
        <img
          src={TPP_LOGO_PATH}
          alt="TPP Electric"
          className="max-h-full max-w-full object-contain"
        />
      </span>
    </span>
  );
}
