"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeaderAuthMenu } from "@/components/header-auth-menu";
import { GlobalNavSearch } from "@/components/global-nav-search";
import { HeaderToolsMenu } from "@/components/header-tools-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { TppLogoPill } from "@/components/tpp-logo-pill";
import { TPP_COMPANY_FULL, TPP_TAGLINE } from "@/lib/tpp-branding";
import { AppMobileNavButton } from "@/components/app-mobile-nav";
import { HomeWeatherWidget } from "@/components/home-weather-widget";

const NAV_IDLE =
  "text-white/80 transition-colors hover:text-[#E8C84A] rounded-md px-1 py-0.5";
const NAV_ACTIVE =
  "font-semibold text-[#E8C84A] rounded-md px-1 py-0.5";

export function HomeMarketingHeader() {
  const pathname = usePathname();
  const onHome = pathname === "/";

  const navItems = (
    <>
      {onHome ? (
        <span className={NAV_ACTIVE}>Home</span>
      ) : (
        <Link href="/" className={NAV_IDLE}>
          Home
        </Link>
      )}
      <Link href="/dashboard" className={NAV_IDLE}>
        Project Dashboard
      </Link>
      <Link href="/jobs" className={NAV_IDLE}>
        Jobs
      </Link>
      <Link href="/customers" className={NAV_IDLE}>
        Customers
      </Link>
      <Link href="/reference" className={NAV_IDLE}>
        Reference
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
    </>
  );

  return (
    <header className="app-header-wide border-b backdrop-blur-md">
      <div className="mx-auto flex min-h-14 max-w-6xl flex-col gap-2 px-4 py-2.5 sm:px-8 lg:min-h-16 lg:py-3">
        <div className="flex w-full items-center gap-2 sm:gap-3">
          <Link
            href="/"
            className="flex min-w-0 max-w-[min(100%,12rem)] shrink-0 items-center gap-2 transition-opacity duration-200 hover:opacity-95 sm:max-w-[min(100%,18rem)] sm:gap-3 md:max-w-[min(100%,22rem)] lg:max-w-[min(100%,28rem)]"
          >
            <TppLogoPill size="compact" className="shrink-0 md:hidden" />
            <TppLogoPill
              size="header"
              className="hidden shrink-0 md:block"
            />
            <div className="hidden min-w-0 text-left sm:block">
              <span className="app-header-title block truncate text-base font-semibold tracking-tight sm:text-lg lg:text-xl">
                Blueprint AI
              </span>
              <span className="mt-0.5 block truncate text-[10px] font-semibold text-[#E8C84A] sm:text-sm">
                {TPP_COMPANY_FULL}
              </span>
              <span className="app-header-sub mt-0.5 hidden text-xs sm:block">
                {TPP_TAGLINE}
              </span>
            </div>
          </Link>

          <div className="flex min-w-0 flex-1 justify-center px-0.5 sm:px-1">
            <HomeWeatherWidget variant="header" />
          </div>

          <div
            className="flex shrink-0 items-center gap-2 sm:gap-3"
            aria-label="Header tools"
          >
            <div className="max-lg:!hidden flex items-center gap-2 sm:gap-3">
              <GlobalNavSearch className="shrink-0" />
              <ThemeToggle />
              <HeaderAuthMenu />
            </div>
            <div className="lg:hidden">
              <AppMobileNavButton variant="marketing" />
            </div>
          </div>
        </div>

        <nav
          className="max-lg:!hidden flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-medium lg:flex lg:flex-1"
          aria-label="Primary"
        >
          {navItems}
        </nav>
      </div>
    </header>
  );
}
