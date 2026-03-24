"use client";

import Link from "next/link";
import { HeaderAuthMenu } from "@/components/header-auth-menu";
import { GlobalNavSearch } from "@/components/global-nav-search";
import { HeaderToolsMenu } from "@/components/header-tools-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { TppLogoPill } from "@/components/tpp-logo-pill";
import {
  TPP_COMPANY_FULL,
  TPP_TAGLINE,
} from "@/lib/tpp-branding";

const NAV_IDLE =
  "text-white/80 transition-colors hover:text-[#E8C84A] rounded-md px-1 py-0.5";
const NAV_ACTIVE =
  "font-semibold text-[#E8C84A] rounded-md px-1 py-0.5";

export function HomeMarketingHeader() {
  return (
    <header className="app-header-wide border-b backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-3 sm:px-8 md:flex-row md:items-center md:gap-4">
        <div className="flex min-w-0 shrink-0 items-center gap-4">
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

        <nav
          className="order-last flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-medium md:order-none md:flex-1 md:justify-center"
          aria-label="Primary"
        >
          <Link href="/dashboard" className={NAV_IDLE}>
            Dashboard
          </Link>
          <Link href="/jobs" className={NAV_IDLE}>
            Jobs
          </Link>
          <HeaderToolsMenu idleClassName={NAV_IDLE} activeClassName={NAV_ACTIVE} />
          <Link href="/upload" className={NAV_IDLE}>
            Upload
          </Link>
          <a href="#product" className={NAV_IDLE}>
            Product
          </a>
          <a href="#contact" className={NAV_IDLE}>
            Contact
          </a>
        </nav>

        <div className="flex w-full items-center justify-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
          <GlobalNavSearch />
          <ThemeToggle />
          <HeaderAuthMenu />
        </div>
      </div>
    </header>
  );
}
