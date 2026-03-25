"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { HeaderAuthMenu } from "@/components/header-auth-menu";
import { GlobalNavSearch } from "@/components/global-nav-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { TppLogoPill } from "@/components/tpp-logo-pill";
import {
  TPP_COMPANY_FULL,
  TPP_TAGLINE,
} from "@/lib/tpp-branding";

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

export function HomeMarketingHeader() {
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

  const navItems = (
    <>
      <Link href="/dashboard" className="app-nav-link-idle" onClick={closeMenu}>
        Dashboard
      </Link>
      <Link href="/jobs" className="app-nav-link-idle" onClick={closeMenu}>
        Jobs
      </Link>
      <Link href="/tools" className="app-nav-link-idle" onClick={closeMenu}>
        Tools
      </Link>
      <Link href="/upload" className="app-nav-link-idle" onClick={closeMenu}>
        Upload
      </Link>
      <a href="#product" className="app-nav-link-idle" onClick={closeMenu}>
        Product
      </a>
      <a href="#contact" className="app-nav-link-idle" onClick={closeMenu}>
        Contact
      </a>
    </>
  );

  return (
    <header className="app-header-wide border-b backdrop-blur-md">
      <div className="mx-auto flex min-h-14 max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-8 lg:min-h-16 lg:py-3">
        <div className="flex min-w-0 items-center gap-2 md:gap-4">
          <TppLogoPill size="tool" className="shrink-0 md:hidden" />
          <TppLogoPill size="hero" className="hidden shrink-0 md:block" />
          <div className="min-w-0">
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
        </div>

        <nav
          className="hidden items-center gap-5 text-sm font-medium md:flex md:max-lg:mr-2 lg:hidden lg:gap-6"
          aria-label="Primary"
        >
          {navItems}
        </nav>

        <div className="hidden flex-1 flex-wrap items-center justify-end gap-3 lg:flex">
          <GlobalNavSearch className="w-64 xl:w-80" />
          <nav
            className="flex flex-wrap items-center gap-5 text-sm font-medium lg:gap-6"
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
