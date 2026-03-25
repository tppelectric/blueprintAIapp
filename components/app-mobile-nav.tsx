"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GlobalNavSearch } from "@/components/global-nav-search";
import { HeaderAuthMenu } from "@/components/header-auth-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { useUserRole } from "@/hooks/use-user-role";

type AppNavKey = "dashboard" | "jobs" | "customers" | "upload";

const TOOL_LINKS: { href: string; label: string }[] = [
  { href: "/tools/project-describer", label: "AI Project Describer" },
  { href: "/tools/wifi-analyzer", label: "Wi‑Fi Analyzer" },
  { href: "/tools/av-analyzer", label: "AV Analyzer" },
  { href: "/tools/smarthome-analyzer", label: "Smart Home Analyzer" },
  { href: "/tools/electrical-analyzer", label: "Electrical Analyzer" },
  { href: "/tools/load-calculator", label: "Load Calculator" },
  { href: "/tools/nec-checker", label: "NEC Code Checker" },
  { href: "/tools/electrical-reference", label: "Electrical Reference" },
  { href: "/tools/motor-hvac-calculator", label: "Motor & HVAC" },
  { href: "/tools/project-breakdown", label: "Project Breakdown" },
];

function linkClass(active: boolean) {
  return [
    "block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200",
    active
      ? "bg-[#E8C84A]/15 text-[#E8C84A]"
      : "text-white/85 hover:bg-white/10",
  ].join(" ");
}

function MobileMenuPortal({
  open,
  onClose,
  variant,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  variant: "marketing" | "app";
  pathname: string;
}) {
  const [mounted, setMounted] = useState(false);
  const { role, loading: roleLoading } = useUserRole();
  const showUserManagement = !roleLoading && role === "super_admin";
  useEffect(() => setMounted(true), []);

  const dashActive = pathname.startsWith("/dashboard");
  const jobsActive = pathname.startsWith("/jobs");
  const custActive = pathname.startsWith("/customers");
  const uploadActive = pathname === "/upload";
  const toolsActive = pathname.startsWith("/tools");
  const adminActive = pathname.startsWith("/admin");
  const homeActive = pathname === "/";

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={[
        "fixed inset-0 z-[999999] lg:hidden transition-[visibility] duration-300 [isolation:isolate] [transform:translateZ(0)]",
        open ? "visible" : "invisible pointer-events-none",
      ].join(" ")}
      role="dialog"
      aria-modal="true"
      aria-label="Site navigation"
      aria-hidden={!open}
    >
      <button
        type="button"
        className={[
          "app-mobile-menu-overlay fixed inset-0 z-[999999] bg-black/60 transition-opacity duration-300 ease-out [transform:translateZ(0)]",
          open ? "opacity-100" : "opacity-0",
        ].join(" ")}
        aria-label="Close menu"
        onClick={onClose}
        tabIndex={open ? 0 : -1}
      />
      <div
        className={[
          "app-mobile-menu-panel fixed right-0 top-0 z-[999999] flex h-full w-[min(100vw-2.5rem,20rem)] flex-col border-l border-white/10 bg-[#0a1628] shadow-2xl transition-transform duration-300 ease-out [isolation:isolate] [transform:translateZ(0)]",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="text-sm font-semibold text-white">Menu</span>
          <button
            type="button"
            className="touch-target-sm rounded-lg px-3 text-lg text-white/80 hover:bg-white/10"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="shrink-0 border-b border-white/10 px-3 py-3">
          <p className="px-1 pb-2 text-[10px] font-bold uppercase tracking-wide text-[#E8C84A]/80">
            Search
          </p>
          <GlobalNavSearch variant="drawer" />
        </div>
        <div className="shrink-0 px-3 pt-2">
          <ThemeToggle className="flex w-full justify-center py-2.5" />
        </div>
        <div className="shrink-0 border-b border-white/10 px-3 pb-3">
          <HeaderAuthMenu />
        </div>
        <nav
          className="min-h-0 flex-1 overflow-y-auto px-3 py-4"
          aria-label="Primary"
        >
          <Link
            href="/"
            className={linkClass(homeActive)}
            onClick={onClose}
          >
            Home
          </Link>
          <Link
            href="/dashboard"
            className={linkClass(dashActive)}
            onClick={onClose}
          >
            Dashboard
          </Link>
          <Link
            href="/jobs"
            className={linkClass(jobsActive)}
            onClick={onClose}
          >
            Jobs
          </Link>
          <Link
            href="/customers"
            className={linkClass(custActive)}
            onClick={onClose}
          >
            Customers
          </Link>
          <Link
            href="/tools"
            className={linkClass(toolsActive)}
            onClick={onClose}
          >
            Tools hub
          </Link>
          <div className="my-2 border-t border-white/10" />
          <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-[#E8C84A]/80">
            Tools
          </p>
          {TOOL_LINKS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={linkClass(
                pathname === t.href || pathname.startsWith(t.href + "/"),
              )}
              onClick={onClose}
            >
              {t.label}
            </Link>
          ))}
          <Link
            href="/upload"
            className={linkClass(uploadActive)}
            onClick={onClose}
          >
            Upload
          </Link>
          {showUserManagement ? (
            <>
              <div className="my-2 border-t border-white/10" />
              <Link
                href="/admin/users"
                className={linkClass(adminActive)}
                onClick={onClose}
              >
                ⚙️ User Management
              </Link>
            </>
          ) : null}
          {variant === "marketing" ? (
            <>
              <a
                href="#product"
                className={linkClass(false)}
                onClick={onClose}
              >
                Product
              </a>
              <a
                href="#contact"
                className={linkClass(false)}
                onClick={onClose}
              >
                Contact
              </a>
            </>
          ) : null}
        </nav>
      </div>
    </div>,
    document.body,
  );
}

export function AppMobileNavButton({
  variant,
  active: _active,
}: {
  variant: "marketing" | "app";
  active?: AppNavKey;
}) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const onClose = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        className="touch-target-md relative z-[1] inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/10 px-3 text-lg text-white lg:hidden"
        aria-expanded={open}
        aria-label="Open navigation menu"
        onClick={() => setOpen(true)}
      >
        ☰
      </button>

      <MobileMenuPortal
        open={open}
        onClose={onClose}
        variant={variant}
        pathname={pathname}
      />
    </>
  );
}
