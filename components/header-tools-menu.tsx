"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { InternalRequestsNavBadge } from "@/components/internal-requests-nav-badge";
import { LicensesNavBadge } from "@/components/licenses-nav-badge";
import { useUserRole } from "@/hooks/use-user-role";
import {
  canManageLicenses,
  canViewAdminRequestQueue,
} from "@/lib/user-roles";

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

export function HeaderToolsMenu({
  idleClassName,
  activeClassName,
}: {
  idleClassName: string;
  activeClassName: string;
}) {
  const pathname = usePathname() ?? "";
  const { role, loading: roleLoading } = useUserRole();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const showUserManagement = !roleLoading && role === "super_admin";
  const showLicenses = !roleLoading && canManageLicenses(role);
  const showRequestsQueue = !roleLoading && canViewAdminRequestQueue(role);

  const toolsPathActive =
    pathname.startsWith("/tools") ||
    pathname.startsWith("/customers") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/inventory") ||
    pathname.startsWith("/receipts") ||
    pathname.startsWith("/licenses") ||
    pathname.startsWith("/jobs/daily-logs") ||
    pathname.startsWith("/my-requests") ||
    pathname.startsWith("/requests");

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={toolsPathActive ? activeClassName : idleClassName}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        Tools{" "}
        <span className="text-[10px] opacity-80" aria-hidden>
          {open ? "▲" : "▼"}
        </span>
      </button>
      <div
        className={[
          "absolute left-1/2 top-full z-[60] mt-2 w-[min(100vw-2rem,16rem)] -translate-x-1/2 overflow-hidden rounded-xl border border-white/15 bg-[#0a1628] py-2 shadow-xl transition-opacity duration-200 ease-out sm:left-0 sm:translate-x-0",
          open
            ? "pointer-events-auto visible opacity-100"
            : "pointer-events-none invisible opacity-0",
        ].join(" ")}
        role="menu"
        aria-hidden={!open}
        onMouseDown={(e) => e.preventDefault()}
      >
        <Link
          href="/customers"
          role="menuitem"
          className="block px-4 py-2.5 text-sm font-medium text-white/90 transition-colors duration-200 hover:bg-white/10"
          onClick={() => setOpen(false)}
        >
          Customers
        </Link>
        <Link
          href="/receipts"
          role="menuitem"
          className={`block px-4 py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-white/10 ${
            pathname.startsWith("/receipts")
              ? "bg-emerald-500/15 text-emerald-200"
              : "text-white/90"
          }`}
          onClick={() => setOpen(false)}
        >
          Receipts
        </Link>
        <Link
          href="/jobs/daily-logs"
          role="menuitem"
          className={`block px-4 py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-white/10 ${
            pathname.startsWith("/jobs/daily-logs")
              ? "bg-orange-500/15 text-orange-200"
              : "text-white/90"
          }`}
          onClick={() => setOpen(false)}
        >
          Daily logs
        </Link>
        <Link
          href="/my-requests"
          role="menuitem"
          className={`block px-4 py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-white/10 ${
            pathname.startsWith("/my-requests")
              ? "bg-sky-500/15 text-sky-200"
              : "text-white/90"
          }`}
          onClick={() => setOpen(false)}
        >
          My requests
        </Link>
        {showRequestsQueue ? (
          <Link
            href="/requests"
            role="menuitem"
            className={`flex items-center justify-between px-4 py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-white/10 ${
              pathname.startsWith("/requests")
                ? "bg-cyan-500/15 text-cyan-100"
                : "text-white/90"
            }`}
            onClick={() => setOpen(false)}
          >
            <span>Requests queue</span>
            <InternalRequestsNavBadge />
          </Link>
        ) : null}
        <Link
          href="/inventory"
          role="menuitem"
          className={`block px-4 py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-white/10 ${
            pathname.startsWith("/inventory")
              ? "bg-violet-500/15 text-violet-200"
              : "text-white/90"
          }`}
          onClick={() => setOpen(false)}
        >
          Inventory & QR
        </Link>
        {showLicenses ? (
          <Link
            href="/licenses"
            role="menuitem"
            className={`flex items-center justify-between px-4 py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-white/10 ${
              pathname.startsWith("/licenses")
                ? "bg-amber-500/15 text-amber-100"
                : "text-white/90"
            }`}
            onClick={() => setOpen(false)}
          >
            <span>Licenses & certifications</span>
            <LicensesNavBadge />
          </Link>
        ) : null}
        <div className="mx-2 border-t border-white/10" />
        <p className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-[#E8C84A]/80">
          Tools
        </p>
        <Link
          href="/reference"
          role="menuitem"
          className={`block px-4 py-2.5 text-sm transition-colors duration-200 hover:bg-white/10 ${
            pathname.startsWith("/reference")
              ? "bg-[#E8C84A]/15 font-semibold text-[#E8C84A]"
              : "text-white/85"
          }`}
          onClick={() => setOpen(false)}
        >
          Reference Library
        </Link>
        {TOOL_LINKS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            role="menuitem"
            className={`block px-4 py-2 text-sm transition-colors duration-200 hover:bg-white/10 ${
              pathname === t.href || pathname.startsWith(t.href + "/")
                ? "bg-[#E8C84A]/15 font-semibold text-[#E8C84A]"
                : "text-white/85"
            }`}
            onClick={() => setOpen(false)}
          >
            {t.label}
          </Link>
        ))}
        <div className="mx-2 border-t border-white/10" />
        <Link
          href="/tools"
          role="menuitem"
          className="block px-4 py-2.5 text-sm text-white/70 transition-colors duration-200 hover:bg-white/10"
          onClick={() => setOpen(false)}
        >
          All tools hub →
        </Link>
        {showUserManagement ? (
          <>
            <div className="mx-2 border-t border-white/10" />
            <Link
              href="/admin/users"
              role="menuitem"
              className={`block px-4 py-2.5 text-sm transition-colors duration-200 hover:bg-white/10 ${
                pathname.startsWith("/admin")
                  ? "bg-[#E8C84A]/15 font-semibold text-[#E8C84A]"
                  : "text-white/90"
              }`}
              onClick={() => setOpen(false)}
            >
              ⚙️ User Management
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
}
