"use client";

import { TPP_LOGO_PATH } from "@/lib/tpp-branding";

const SIZES = {
  hero: "w-28 sm:w-36 md:w-44",
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
      className={`flex shrink-0 items-center justify-center bg-transparent ${SIZES[size]} ${className}`}
    >
      <span className="flex w-full min-w-0 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- public asset */}
        <img
          src={TPP_LOGO_PATH}
          alt="TPP Electric"
          className="h-auto w-full object-contain"
          style={{ mixBlendMode: "multiply" }}
        />
      </span>
    </span>
  );
}
