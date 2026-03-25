"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { HeaderAuthMenu } from "@/components/header-auth-menu";
import { GlobalNavSearch } from "@/components/global-nav-search";
import { HeaderToolsMenu } from "@/components/header-tools-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { TppLogoPill } from "@/components/tpp-logo-pill";
import { TPP_COMPANY_FULL, TPP_TAGLINE } from "@/lib/tpp-branding";
import { AppMobileNavButton } from "@/components/app-mobile-nav";

export type NavKey = "dashboard" | "jobs" | "customers" | "upload";

const NAV_IDLE =
  "inline-flex items-center border-b-2 border-transparent px-2 py-1.5 text-sm font-medium text-white/85 transition-colors duration-200 hover:border-[#E8C84A]/45 hover:text-[#E8C84A]";
const NAV_ACTIVE =
  "inline-flex items-center border-b-2 border-[#E8C84A] px-2 py-1.5 text-sm font-medium text-[#E8C84A] transition-colors duration-200";

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <span className="relative block h-5 w-6" aria-hidden>
      <span
        className={[
          "absolute left-0 top-1 block h-0.5 w-full rounded bg-current transition-transform",
          open ? "translate-y-1.5 rotate-45" : "",
        ].join(" ")}
      />
      <span
        className={[
          "absolute left-0 top-1/2 block h-0.5 w-full -translate-y-1/2 rounded bg-current transition-opacity",
          open ? "opacity-0" : "",
        ].join(" ")}
      />
      <span
        className={[
          "absolute bottom-1 left-0 block h-0.5 w-full rounded bg-current transition-transform",
          open ? "-translate-y-1.5 -rotate-45" : "",
        ].join(" ")}
      />
    </span>
  );
}

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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const homeActive = pathname === "/";
  const dashActive =
    active === "dashboard" || pathname.startsWith("/dashboard");
  const jobsActive = active === "jobs" || pathname.startsWith("/jobs");
  const custActive =
    active === "customers" || pathname.startsWith("/customers");
  const uploadActive = active === "upload" || pathname === "/upload";

  const navItemsDesktop = (
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

  const navItemsMobile = (
    <>
      {homeActive ? (
        <span className={NAV_ACTIVE}>Home</span>
      ) : (
        <Link href="/" className={NAV_IDLE} onClick={closeMenu}>
          Home
        </Link>
      )}
      {dashActive ? (
        <span className={NAV_ACTIVE}>Dashboard</span>
      ) : (
        <Link href="/dashboard" className={NAV_IDLE} onClick={closeMenu}>
          Dashboard
        </Link>
      )}
      {jobsActive ? (
        <span className={NAV_ACTIVE}>Jobs</span>
      ) : (
        <Link href="/jobs" className={NAV_IDLE} onClick={closeMenu}>
          Jobs
        </Link>
      )}
      {custActive ? (
        <span className={NAV_ACTIVE}>Customers</span>
      ) : (
        <Link href="/customers" className={NAV_IDLE} onClick={closeMenu}>
          Customers
        </Link>
      )}
      <HeaderToolsMenu idleClassName={NAV_IDLE} activeClassName={NAV_ACTIVE} />
      {uploadActive ? (
        <span className={NAV_ACTIVE}>Upload</span>
      ) : (
        <Link href="/upload" className={NAV_IDLE} onClick={closeMenu}>
          Upload
        </Link>
      )}
      {extraLinks}
    </>
  );

  return (
    <header className="app-header-wide border-b border-white/10 backdrop-blur-md transition-colors duration-200">
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-8">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="flex min-w-0 max-w-[min(100%,20rem)] shrink items-center gap-2 transition-opacity duration-200 hover:opacity-95 sm:max-w-[min(100%,28rem)] sm:gap-3 md:shrink-0"
          >
            <TppLogoPill size="tool" className="md:hidden" />
            <TppLogoPill size="header" className="hidden md:block" />
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
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden lg:block">
              <GlobalNavSearch className="w-64 xl:w-80" />
            </div>
            <ThemeToggle />
            <HeaderAuthMenu />
            {extraLinks}
            <AppMobileNavButton variant="app" active={active} />
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white hover:bg-white/15 lg:hidden"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <HamburgerIcon open={menuOpen} />
            </button>
          </div>
        </div>

        <nav
          className="mt-3 hidden flex-wrap items-center justify-center gap-x-1 gap-y-2 text-sm font-medium sm:gap-x-2 md:flex md:flex-1"
          aria-label="Primary"
        >
          {navItemsDesktop}
        </nav>
      </div>

      {menuOpen ? (
        <div
          className="fixed inset-0 z-[120] lg:hidden"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={closeMenu}
          />
          <aside
            className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col gap-5 border-l border-white/15 bg-[#071422] p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">Menu</p>
              <button
                type="button"
                onClick={closeMenu}
                className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
              >
                Close
              </button>
            </div>
            <div className="border-b border-white/10 pb-4">
              <HeaderAuthMenu />
            </div>
            <nav
              className="flex flex-col gap-3 text-sm font-medium"
              aria-label="Primary mobile"
            >
              {navItemsMobile}
            </nav>
            <div className="border-t border-white/10 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/45">
                Search
              </p>
              <GlobalNavSearch className="w-full" />
            </div>
            <div className="flex items-center gap-3 border-t border-white/10 pt-4">
              <span className="text-sm text-white/70">Theme</span>
              <ThemeToggle />
            </div>
          </aside>
        </div>
      ) : null}
    </header>
  );
}
