"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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

  const navLinkClass = (isActive: boolean) =>
    isActive ? "app-nav-link-active" : "app-nav-link-idle";

  const navItems = (
    <>
      {active === "home" ? (
        <span className={navLinkClass(true)}>Home</span>
      ) : (
        <Link href="/" className={navLinkClass(false)} onClick={closeMenu}>
          Home
        </Link>
      )}
      {active === "dashboard" ? (
        <span className={navLinkClass(true)}>Dashboard</span>
      ) : (
        <Link href="/dashboard" className={navLinkClass(false)} onClick={closeMenu}>
          Dashboard
        </Link>
      )}
      {active === "jobs" ? (
        <span className={navLinkClass(true)}>Jobs</span>
      ) : (
        <Link href="/jobs" className={navLinkClass(false)} onClick={closeMenu}>
          Jobs
        </Link>
      )}
      {active === "customers" ? (
        <span className={navLinkClass(true)}>Customers</span>
      ) : (
        <Link href="/customers" className={navLinkClass(false)} onClick={closeMenu}>
          Customers
        </Link>
      )}
      {active === "tools" ? (
        <span className={navLinkClass(true)}>Tools</span>
      ) : (
        <Link href="/tools" className={navLinkClass(false)} onClick={closeMenu}>
          Tools
        </Link>
      )}
      {active === "upload" ? (
        <span className={navLinkClass(true)}>Upload</span>
      ) : (
        <Link href="/upload" className={navLinkClass(false)} onClick={closeMenu}>
          Upload
        </Link>
      )}
      {extraLinks}
    </>
  );

  return (
    <header className="app-header-wide border-b backdrop-blur-md">
      <div className="mx-auto flex min-h-14 max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-8 lg:min-h-16 lg:flex-wrap lg:py-3">
        <Link
          href="/"
          className="flex min-w-0 max-w-[min(100%,20rem)] items-center gap-2 transition-opacity hover:opacity-95 md:max-w-[min(100%,28rem)] md:gap-3"
        >
          <TppLogoPill size="tool" className="md:hidden" />
          <TppLogoPill size="header" className="hidden md:block" />
          <div className="min-w-0 text-left">
            <span className="app-header-title block truncate text-base font-semibold tracking-tight sm:text-lg">
              Blueprint AI
            </span>
            {showTppSubtitle ? (
              <span className="mt-0.5 block truncate text-[10px] font-semibold text-[#E8C84A] sm:text-sm">
                {TPP_COMPANY_FULL}
              </span>
            ) : (
              <span className="app-header-sub mt-0.5 hidden text-xs sm:block">
                {TPP_TAGLINE}
              </span>
            )}
          </div>
        </Link>

        <nav
          className="hidden items-center gap-4 text-sm font-medium md:flex md:max-lg:mr-2 lg:hidden lg:gap-5"
          aria-label="Primary"
        >
          {navItems}
        </nav>

        <div className="hidden flex-1 flex-wrap items-center justify-end gap-3 lg:flex">
          <GlobalNavSearch className="w-64 xl:w-80" />
          <nav
            className="flex flex-wrap items-center gap-4 text-sm font-medium lg:gap-5"
            aria-label="Primary desktop"
          >
            {navItems}
            <ThemeToggle />
            <HeaderAuthMenu />
          </nav>
        </div>

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
              {navItems}
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
