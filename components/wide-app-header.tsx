"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { HeaderAuthMenu } from "@/components/header-auth-menu";
import { GlobalNavSearch } from "@/components/global-nav-search";
import { HeaderToolsMenu } from "@/components/header-tools-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { TppLogoPill } from "@/components/tpp-logo-pill";
import { TPP_COMPANY_FULL, TPP_TAGLINE } from "@/lib/tpp-branding";
import { AppMobileNavButton } from "@/components/app-mobile-nav";

export type NavKey = "dashboard" | "jobs" | "customers" | "upload";

const NAV_IDLE =
  "app-nav-link-idle rounded-md px-1 py-0.5 transition-colors hover:text-[#E8C84A]";
const NAV_ACTIVE = "app-nav-link-active rounded-md px-1 py-0.5";

export function WideAppHeader({
  active,
  showTppSubtitle,
  extraLinks,
}: {
  active: NavKey;
  showTppSubtitle?: boolean;
  extraLinks?: ReactNode;
}) {
  return (
    <header className="app-header-wide border-b backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-8">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/"
            className="flex min-w-0 max-w-[min(100%,20rem)] shrink items-center gap-2 transition-opacity hover:opacity-95 sm:max-w-[min(100%,28rem)] sm:gap-3 md:shrink-0"
          >
            <TppLogoPill size="header" />
            <div className="min-w-0 text-left">
              <span className="app-header-title block truncate text-base font-semibold tracking-tight sm:text-lg">
                Blueprint AI
              </span>
              {showTppSubtitle ? (
                <span className="mt-0.5 block truncate text-xs font-semibold text-[#E8C84A] sm:text-sm">
                  {TPP_COMPANY_FULL}
                </span>
              ) : (
                <span className="app-header-sub mt-0.5 hidden text-xs sm:block">
                  {TPP_TAGLINE}
                </span>
              )}
            </div>
          </Link>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <GlobalNavSearch />
            <ThemeToggle />
            <HeaderAuthMenu />
            {extraLinks}
            <AppMobileNavButton variant="app" active={active} />
          </div>
        </div>

        <nav
          className="mt-3 hidden flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium md:flex md:flex-1"
          aria-label="Primary"
        >
          <Link href="/" className={NAV_IDLE}>
            Home
          </Link>
          {active === "dashboard" ? (
            <span className={NAV_ACTIVE}>Dashboard</span>
          ) : (
            <Link href="/dashboard" className={NAV_IDLE}>
              Dashboard
            </Link>
          )}
          {active === "jobs" ? (
            <span className={NAV_ACTIVE}>Jobs</span>
          ) : (
            <Link href="/jobs" className={NAV_IDLE}>
              Jobs
            </Link>
          )}
          {active === "customers" ? (
            <span className={NAV_ACTIVE}>Customers</span>
          ) : (
            <Link href="/customers" className={NAV_IDLE}>
              Customers
            </Link>
          )}
          <HeaderToolsMenu idleClassName={NAV_IDLE} activeClassName={NAV_ACTIVE} />
          {active === "upload" ? (
            <span className={NAV_ACTIVE}>Upload</span>
          ) : (
            <Link href="/upload" className={NAV_IDLE}>
              Upload
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
