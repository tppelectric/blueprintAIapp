"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeaderAuthMenu } from "@/components/header-auth-menu";
import { GlobalNavSearch } from "@/components/global-nav-search";
import { HeaderToolsMenu } from "@/components/header-tools-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { TppLogoPill } from "@/components/tpp-logo-pill";
import {
  TPP_COMPANY_FULL,
  TPP_TAGLINE,
} from "@/lib/tpp-branding";
import { AppMobileNavButton } from "@/components/app-mobile-nav";

const NAV_IDLE =
  "text-white/80 transition-colors hover:text-[#E8C84A] rounded-md px-1 py-0.5";
const NAV_ACTIVE =
  "font-semibold text-[#E8C84A] rounded-md px-1 py-0.5";

export function HomeMarketingHeader() {
  const pathname = usePathname();
  const onHome = pathname === "/";

  return (
    <header className="app-header-wide border-b backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-8">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4 md:flex-initial">
            <TppLogoPill size="hero" />
            <div className="min-w-0">
              <span className="app-header-title block text-base font-semibold tracking-tight sm:text-lg md:text-xl">
                Blueprint AI
              </span>
              <span className="mt-0.5 block text-xs font-semibold text-[#E8C84A] sm:text-sm">
                {TPP_COMPANY_FULL}
              </span>
              <span className="app-header-sub mt-0.5 block text-[11px] sm:text-xs">
                {TPP_TAGLINE}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <GlobalNavSearch />
            <ThemeToggle />
            <HeaderAuthMenu />
            <AppMobileNavButton variant="marketing" />
          </div>
        </div>

        <nav
          className="mt-3 hidden flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-medium md:flex md:flex-1"
          aria-label="Primary"
        >
          {onHome ? (
            <span className={NAV_ACTIVE}>Home</span>
          ) : (
            <Link href="/" className={NAV_IDLE}>
              Home
            </Link>
          )}
          <Link href="/dashboard" className={NAV_IDLE}>
            Dashboard
          </Link>
          <Link href="/jobs" className={NAV_IDLE}>
            Jobs
          </Link>
          <Link href="/customers" className={NAV_IDLE}>
            Customers
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
      </div>
    </header>
  );
}
