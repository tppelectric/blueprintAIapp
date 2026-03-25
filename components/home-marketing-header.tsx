"use client";

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

const NAV_IDLE =
  "text-white/80 transition-colors hover:text-[#E8C84A] rounded-md px-1 py-0.5";
const NAV_ACTIVE =
  "font-semibold text-[#E8C84A] rounded-md px-1 py-0.5";

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
  const pathname = usePathname();
  const onHome = pathname === "/";
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

  const navItemsDesktop = (
    <>
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
    </>
  );

  const navItemsMobile = (
    <>
      {onHome ? (
        <span className={NAV_ACTIVE}>Home</span>
      ) : (
        <Link href="/" className={NAV_IDLE} onClick={closeMenu}>
          Home
        </Link>
      )}
      <Link href="/dashboard" className={NAV_IDLE} onClick={closeMenu}>
        Dashboard
      </Link>
      <Link href="/jobs" className={NAV_IDLE} onClick={closeMenu}>
        Jobs
      </Link>
      <Link href="/customers" className={NAV_IDLE} onClick={closeMenu}>
        Customers
      </Link>
      <HeaderToolsMenu idleClassName={NAV_IDLE} activeClassName={NAV_ACTIVE} />
      <Link href="/upload" className={NAV_IDLE} onClick={closeMenu}>
        Upload
      </Link>
      <a href="#product" className={NAV_IDLE} onClick={closeMenu}>
        Product
      </a>
      <a href="#contact" className={NAV_IDLE} onClick={closeMenu}>
        Contact
      </a>
    </>
  );

  return (
    <header className="app-header-wide border-b backdrop-blur-md">
      <div className="mx-auto flex min-h-14 max-w-6xl flex-col gap-2 px-4 py-2.5 sm:px-8 lg:min-h-16 lg:py-3">
        <div className="flex items-center justify-between gap-3">
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
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <div className="hidden lg:block">
              <GlobalNavSearch className="w-64 xl:w-80" />
            </div>
            <ThemeToggle />
            <HeaderAuthMenu />
            <AppMobileNavButton variant="marketing" />
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
          className="hidden flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-medium md:flex md:flex-1"
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
