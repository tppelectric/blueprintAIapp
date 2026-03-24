"use client";

import Link from "next/link";
import { HeaderAuthMenu } from "@/components/header-auth-menu";
import { GlobalNavSearch } from "@/components/global-nav-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { TppLogoPill } from "@/components/tpp-logo-pill";
import {
  TPP_COMPANY_FULL,
  TPP_TAGLINE,
} from "@/lib/tpp-branding";

export function HomeMarketingHeader() {
  return (
    <header className="app-header-wide border-b backdrop-blur-md">
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3 sm:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <TppLogoPill size="hero" />
          <div className="min-w-0">
            <span className="app-header-title block text-lg font-semibold tracking-tight sm:text-xl">
              Blueprint AI
            </span>
            <span className="mt-0.5 block text-xs font-semibold text-[#E8C84A] sm:text-sm">
              {TPP_COMPANY_FULL}
            </span>
            <span className="app-header-sub mt-0.5 block text-xs">
              {TPP_TAGLINE}
            </span>
          </div>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <GlobalNavSearch className="order-first w-full sm:order-none sm:mx-2 sm:w-64 lg:w-80" />
          <nav
            className="flex flex-wrap items-center gap-5 text-sm font-medium sm:gap-6"
            aria-label="Primary"
          >
            <Link href="/dashboard" className="app-nav-link-idle">
              Dashboard
            </Link>
            <Link href="/jobs" className="app-nav-link-idle">
              Jobs
            </Link>
            <Link href="/tools" className="app-nav-link-idle">
              Tools
            </Link>
            <Link href="/upload" className="app-nav-link-idle">
              Upload
            </Link>
            <a href="#product" className="app-nav-link-idle">
              Product
            </a>
            <a href="#contact" className="app-nav-link-idle">
              Contact
            </a>
            <ThemeToggle />
            <HeaderAuthMenu />
          </nav>
        </div>
      </div>
    </header>
  );
}
