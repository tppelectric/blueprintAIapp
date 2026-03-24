"use client";

import { TPP_LOGO_PATH } from "@/lib/tpp-branding";

const SIZES = {
  hero: "h-40 w-40",
  header: "h-32 w-32",
  tool: "h-24 w-24",
  compact: "h-20 w-20",
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
