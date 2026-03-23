"use client";

import Link from "next/link";
import { TppLogoPill } from "@/components/tpp-logo-pill";
import {
  TPP_COMPANY_FULL,
  TPP_TAGLINE,
} from "@/lib/tpp-branding";

export function HomeMarketingHeader() {
  return (
    <header className="border-b border-white/10 bg-[#071422]/80 backdrop-blur-md">
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3 sm:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <TppLogoPill size="hero" />
          <div className="min-w-0">
            <span className="block text-lg font-semibold tracking-tight text-white sm:text-xl">
              Blueprint AI
            </span>
            <span className="mt-0.5 block text-xs font-semibold text-[#E8C84A] sm:text-sm">
              {TPP_COMPANY_FULL}
            </span>
            <span className="mt-0.5 block text-xs text-white/50">
              {TPP_TAGLINE}
            </span>
          </div>
        </div>
        <nav
          className="flex items-center gap-6 text-sm font-medium text-white/75 sm:gap-8"
          aria-label="Primary"
        >
          <Link
            href="/dashboard"
            className="transition-colors hover:text-[#E8C84A]"
          >
            Dashboard
          </Link>
          <a
            href="#product"
            className="transition-colors hover:text-[#E8C84A]"
          >
            Product
          </a>
          <a
            href="#contact"
            className="transition-colors hover:text-[#E8C84A]"
          >
            Contact
          </a>
        </nav>
      </div>
    </header>
  );
}
