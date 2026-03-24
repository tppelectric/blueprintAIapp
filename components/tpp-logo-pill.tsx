"use client";

import { TPP_LOGO_PATH } from "@/lib/tpp-branding";

/** Width tokens: hero 128px, dashboard header 96px, tool headers 80px, compact 64px. */
const SIZES = {
  hero: "w-32",
  header: "w-24",
  tool: "w-20",
  compact: "w-16",
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
      <span className="flex h-full min-h-0 w-full min-w-0 items-center justify-center">
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
