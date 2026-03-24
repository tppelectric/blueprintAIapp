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
      className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-white p-2 ${SIZES[size]} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- public asset */}
      <img
        src={TPP_LOGO_PATH}
        alt="TPP Electric"
        className="h-auto w-full object-contain"
      />
    </span>
  );
}
