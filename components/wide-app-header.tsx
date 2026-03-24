import type { ReactNode } from "react";
import Link from "next/link";
import { HeaderAuthMenu } from "@/components/header-auth-menu";
import { GlobalNavSearch } from "@/components/global-nav-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { TppLogoPill } from "@/components/tpp-logo-pill";
import { TPP_COMPANY_FULL, TPP_TAGLINE } from "@/lib/tpp-branding";

type NavKey =
  | "home"
  | "dashboard"
  | "jobs"
  | "customers"
  | "tools"
  | "upload";

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
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3 sm:px-8">
        <Link
          href="/"
          className="flex min-w-0 max-w-[min(100%,28rem)] items-center gap-3 transition-opacity hover:opacity-95"
        >
          <TppLogoPill size="header" />
          <div className="min-w-0 text-left">
            <span className="app-header-title block truncate text-lg font-semibold tracking-tight">
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
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <GlobalNavSearch className="order-first w-full sm:order-none sm:mx-2 sm:w-64 lg:w-80" />
          <nav
            className="flex flex-wrap items-center gap-4 text-sm font-medium sm:gap-5"
            aria-label="Primary"
          >
            {active === "home" ? (
              <span className="app-nav-link-active">Home</span>
            ) : (
              <Link href="/" className="app-nav-link-idle">
                Home
              </Link>
            )}
            {active === "dashboard" ? (
              <span className="app-nav-link-active">Dashboard</span>
            ) : (
              <Link href="/dashboard" className="app-nav-link-idle">
                Dashboard
              </Link>
            )}
            {active === "jobs" ? (
              <span className="app-nav-link-active">Jobs</span>
            ) : (
              <Link href="/jobs" className="app-nav-link-idle">
                Jobs
              </Link>
            )}
            {active === "customers" ? (
              <span className="app-nav-link-active">Customers</span>
            ) : (
              <Link href="/customers" className="app-nav-link-idle">
                Customers
              </Link>
            )}
            {active === "tools" ? (
              <span className="app-nav-link-active">Tools</span>
            ) : (
              <Link href="/tools" className="app-nav-link-idle">
                Tools
              </Link>
            )}
            {active === "upload" ? (
              <span className="app-nav-link-active">Upload</span>
            ) : (
              <Link href="/upload" className="app-nav-link-idle">
                Upload
              </Link>
            )}
            {extraLinks}
            <ThemeToggle />
            <HeaderAuthMenu />
          </nav>
        </div>
      </div>
    </header>
  );
}
