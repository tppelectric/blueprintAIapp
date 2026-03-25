"use client";

import { TPP_LOGO_PATH } from "@/lib/tpp-branding";

const SIZES = {
  hero: "w-32 h-32",
  header: "w-24 h-24",
  nav: "w-16 h-16",
  tool: "w-20 h-20",
  compact: "w-14 h-14",
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
      className={`inline-flex items-center justify-center overflow-hidden rounded-lg bg-white ${SIZES[size]} ${className}`}
    >
      <img
        src={TPP_LOGO_PATH}
        alt="TPP Electric"
        width={256}
        height={256}
        decoding="async"
        draggable={false}
        className="h-full w-full object-contain p-1"
      />
    </span>
  );
}
