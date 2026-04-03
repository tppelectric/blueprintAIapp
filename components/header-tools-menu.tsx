"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { InternalRequestsNavBadge } from "@/components/internal-requests-nav-badge";
import { LicensesNavBadge } from "@/components/licenses-nav-badge";
import { PendingTimeOffNavBadge } from "@/components/pending-time-off-nav-badge";
import { TeamClockNavBadge } from "@/components/team-clock-nav-badge";
import { useUserRole } from "@/hooks/use-user-role";
import {
  canManageIntegrations,
  canManageLicenses,
  canUseFieldPunch,
  canViewAdminRequestQueue,
  canViewTeamClock,
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

const SECTION =
  "px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-[#E8C84A]/80";

function rowClass(active: boolean, extra = ""): string {
  return [
    "block px-4 py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-white/10",
    active ? "bg-[#E8C84A]/12 text-[#E8C84A]" : "text-white/90",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export function HeaderToolsMenu({
  idleClassName,
  activeClassName,
}: {
  idleClassName: string;
  activeClassName: string;
}) {
  const pathname = usePathname() ?? "";
  const { role, loading: roleLoading, profile } = useUserRole();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const showUserManagement = !roleLoading && role === "super_admin";
  const showCrewManagement =
    !roleLoading && (role === "admin" || role === "super_admin");
  const showSettings = !roleLoading && canManageIntegrations(role);
  const showLicenses = !roleLoading && canManageLicenses(role);
  const showRequestsQueue = !roleLoading && canViewAdminRequestQueue(role);
  const showTeamClock = !roleLoading && canViewTeamClock(role);
  const showFieldPunch = !roleLoading && canUseFieldPunch(profile ?? null);

  const toolsPathActive =
    pathname.startsWith("/tools") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/jobs/daily-logs") ||
    pathname.startsWith("/receipts") ||
    pathname.startsWith("/team-clock") ||
    pathname.startsWith("/field") ||
    pathname.startsWith("/timesheets") ||
    pathname.startsWith("/time-off") ||
    pathname.startsWith("/calendar") ||
    pathname.startsWith("/my-requests") ||
    pathname.startsWith("/requests") ||
    pathname.startsWith("/inventory") ||
    pathname.startsWith("/licenses") ||
    pathname.startsWith("/reference") ||
    pathname.startsWith("/upload") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/settings");

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
          "absolute left-1/2 top-full z-[60] mt-2 max-h-[min(70vh,32rem)] w-[min(100vw-2rem,22rem)] -translate-x-1/2 overflow-y-auto overflow-x-hidden rounded-xl border border-white/15 bg-[#0a1628] py-1 shadow-xl transition-opacity duration-200 ease-out sm:left-0 sm:translate-x-0",
          open
            ? "pointer-events-auto visible opacity-100"
            : "pointer-events-none invisible opacity-0",
        ].join(" ")}
        role="menu"
        aria-hidden={!open}
        onMouseDown={(e) => e.preventDefault()}
      >
        <p className={`${SECTION} pt-3`}>Field operations</p>
        <Link
          href="/dashboard"
          role="menuitem"
          className={rowClass(pathname.startsWith("/dashboard"))}
          onClick={() => setOpen(false)}
        >
          Project dashboard
        </Link>
        <Link
          href="/jobs/daily-logs"
          role="menuitem"
          className={rowClass(pathname.startsWith("/jobs/daily-logs"))}
          onClick={() => setOpen(false)}
        >
          Daily logs
        </Link>
        <Link
          href="/receipts"
          role="menuitem"
          className={rowClass(pathname.startsWith("/receipts"))}
          onClick={() => setOpen(false)}
        >
          Receipts
        </Link>
        {showTeamClock ? (
          <Link
            href="/team-clock"
            role="menuitem"
            className={`${rowClass(pathname.startsWith("/team-clock"))} flex items-center justify-between gap-2`}
            onClick={() => setOpen(false)}
          >
            <span>Team clock</span>
            <TeamClockNavBadge />
          </Link>
        ) : null}
        {showFieldPunch ? (
          <Link
            href="/field"
            role="menuitem"
            className={rowClass(pathname.startsWith("/field"))}
            onClick={() => setOpen(false)}
          >
            Field punch
          </Link>
        ) : null}
        <Link
          href="/timesheets"
          role="menuitem"
          className={rowClass(pathname.startsWith("/timesheets"))}
          onClick={() => setOpen(false)}
        >
          Timesheets
        </Link>
        <Link
          href="/time-off"
          role="menuitem"
          className={`${rowClass(pathname.startsWith("/time-off"))} flex items-center justify-between gap-2`}
          onClick={() => setOpen(false)}
        >
          <span>Time off</span>
          <PendingTimeOffNavBadge />
        </Link>
        <Link
          href="/calendar"
          role="menuitem"
          className={rowClass(pathname.startsWith("/calendar"))}
          onClick={() => setOpen(false)}
        >
          Calendar
        </Link>
        <Link
          href="/my-requests"
          role="menuitem"
          className={rowClass(pathname.startsWith("/my-requests"))}
          onClick={() => setOpen(false)}
        >
          My requests
        </Link>
        {showRequestsQueue ? (
          <Link
            href="/requests"
            role="menuitem"
            className={`${rowClass(pathname.startsWith("/requests"))} flex items-center justify-between gap-2`}
            onClick={() => setOpen(false)}
          >
            <span>Requests queue</span>
            <InternalRequestsNavBadge />
          </Link>
        ) : null}
        <Link
          href="/upload"
          role="menuitem"
          className={rowClass(pathname === "/upload")}
          onClick={() => setOpen(false)}
        >
          Upload
        </Link>

        <div className="mx-2 my-1 border-t border-white/10" />
        <p className={SECTION}>Management</p>
        {showLicenses ? (
          <Link
            href="/licenses"
            role="menuitem"
            className={`${rowClass(pathname.startsWith("/licenses"))} flex items-center justify-between gap-2`}
            onClick={() => setOpen(false)}
          >
            <span>Licenses &amp; certifications</span>
            <LicensesNavBadge />
          </Link>
        ) : null}
        <Link
          href="/inventory"
          role="menuitem"
          className={rowClass(
            pathname.startsWith("/inventory") &&
              !pathname.startsWith("/inventory/vehicles"),
          )}
          onClick={() => setOpen(false)}
        >
          Inventory &amp; QR
        </Link>
        <Link
          href="/inventory/vehicles"
          role="menuitem"
          className={rowClass(pathname.startsWith("/inventory/vehicles"))}
          onClick={() => setOpen(false)}
        >
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden>🚛</span>
            Fleet Vehicles
          </span>
        </Link>
        <Link
          href="/reference"
          role="menuitem"
          className={rowClass(pathname.startsWith("/reference"))}
          onClick={() => setOpen(false)}
        >
          Reference library
        </Link>

        <div className="mx-2 my-1 border-t border-white/10" />
        <p className={SECTION}>Electrical tools</p>
        {TOOL_LINKS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            role="menuitem"
            className={rowClass(
              pathname === t.href || pathname.startsWith(t.href + "/"),
              "py-2 text-[13px] font-normal text-white/85",
            )}
            onClick={() => setOpen(false)}
          >
            {t.label}
          </Link>
        ))}
        <Link
          href="/tools"
          role="menuitem"
          className="block px-4 py-2.5 text-sm text-white/65 transition-colors duration-200 hover:bg-white/10"
          onClick={() => setOpen(false)}
        >
          All tools hub →
        </Link>

        {showUserManagement || showSettings || showCrewManagement ? (
          <>
            <div className="mx-2 my-1 border-t border-white/10" />
            <p className={SECTION}>Admin</p>
            {showUserManagement ? (
              <Link
                href="/admin/users"
                role="menuitem"
                className={rowClass(pathname.startsWith("/admin/users"))}
                onClick={() => setOpen(false)}
              >
                User management
              </Link>
            ) : null}
            {showCrewManagement ? (
              <Link
                href="/admin/crews"
                role="menuitem"
                className={rowClass(pathname.startsWith("/admin/crews"))}
                onClick={() => setOpen(false)}
              >
                Crews
              </Link>
            ) : null}
            {showSettings ? (
              <Link
                href="/settings/integrations"
                role="menuitem"
                className={rowClass(pathname.startsWith("/settings"))}
                onClick={() => setOpen(false)}
              >
                Settings
              </Link>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
