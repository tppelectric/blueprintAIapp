"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeaderAuthMenu } from "@/components/header-auth-menu";
import { GlobalNavSearch } from "@/components/global-nav-search";
import { HeaderToolsMenu } from "@/components/header-tools-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { TppLogoPill } from "@/components/tpp-logo-pill";
import { TPP_COMPANY_FULL, TPP_TAGLINE } from "@/lib/tpp-branding";
import { AppMobileNavButton } from "@/components/app-mobile-nav";
import { useUserRole } from "@/hooks/use-user-role";

export type NavKey = "dashboard" | "jobs" | "customers" | "upload";

const NAV_IDLE =
  "inline-flex items-center border-b-2 border-transparent px-2 py-1.5 text-sm font-medium text-white/85 transition-colors duration-200 hover:border-[#E8C84A]/45 hover:text-[#E8C84A]";
const NAV_ACTIVE =
  "inline-flex items-center border-b-2 border-[#E8C84A] px-2 py-1.5 text-sm font-medium text-[#E8C84A] transition-colors duration-200";

export function WideAppHeader({
  active,
  showTppSubtitle,
  extraLinks,
}: {
  active: NavKey;
  showTppSubtitle?: boolean;
  extraLinks?: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const { role, loading: roleLoading } = useUserRole();
  const showAdminUsersNav = !roleLoading && role === "super_admin";

  const homeActive = pathname === "/";
  const dashActive =
    active === "dashboard" || pathname.startsWith("/dashboard");
  const jobsActive = active === "jobs" || pathname.startsWith("/jobs");
  const custActive =
    active === "customers" || pathname.startsWith("/customers");
  const uploadActive = active === "upload" || pathname === "/upload";
  const adminUsersActive = pathname.startsWith("/admin");

  const navItems = (
    <>
      {homeActive ? (
        <span className={NAV_ACTIVE}>Home</span>
      ) : (
        <Link href="/" className={NAV_IDLE}>
          Home
        </Link>
      )}
      {dashActive ? (
        <span className={NAV_ACTIVE}>Dashboard</span>
      ) : (
        <Link href="/dashboard" className={NAV_IDLE}>
          Dashboard
        </Link>
      )}
      {jobsActive ? (
        <span className={NAV_ACTIVE}>Jobs</span>
      ) : (
        <Link href="/jobs" className={NAV_IDLE}>
          Jobs
        </Link>
      )}
      {custActive ? (
        <span className={NAV_ACTIVE}>Customers</span>
      ) : (
        <Link href="/customers" className={NAV_IDLE}>
          Customers
        </Link>
      )}
      <HeaderToolsMenu idleClassName={NAV_IDLE} activeClassName={NAV_ACTIVE} />
      {showAdminUsersNav ? (
        adminUsersActive ? (
          <span className={NAV_ACTIVE}>User Management</span>
        ) : (
          <Link href="/admin/users" className={NAV_IDLE}>
            User Management
          </Link>
        )
      ) : null}
      {uploadActive ? (
        <span className={NAV_ACTIVE}>Upload</span>
      ) : (
        <Link href="/upload" className={NAV_IDLE}>
          Upload
        </Link>
      )}
      {extraLinks}
    </>
  );

  return (
    <header className="app-header-wide border-b border-white/10 backdrop-blur-md transition-colors duration-200">
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex min-w-0 flex-1 items-center gap-3 transition-opacity duration-200 hover:opacity-95 lg:max-w-[min(100%,28rem)] lg:flex-initial lg:shrink-0"
          >
            <TppLogoPill size="compact" className="shrink-0 md:hidden" />
            <TppLogoPill
              size="header"
              className="hidden shrink-0 md:block"
            />
            <div className="hidden min-w-0 text-left sm:block">
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

          <div
            className="max-lg:!hidden flex shrink-0 items-center gap-2 sm:gap-3"
            aria-label="Header tools"
          >
            <GlobalNavSearch className="shrink-0" />
            <ThemeToggle />
            <HeaderAuthMenu />
          </div>

          <div className="shrink-0 lg:hidden">
            <AppMobileNavButton variant="app" active={active} />
          </div>
        </div>

        <nav
          className="mt-3 max-lg:!hidden flex-wrap items-center justify-center gap-x-1 gap-y-2 text-sm font-medium sm:gap-x-2 lg:flex lg:flex-1"
          aria-label="Primary"
        >
          {navItems}
        </nav>
      </div>
    </header>
  );
}
