"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GlobalNavSearch } from "@/components/global-nav-search";
import { PendingTimeOffNavBadge } from "@/components/pending-time-off-nav-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { TeamClockNavBadge } from "@/components/team-clock-nav-badge";
import { useUserRole } from "@/hooks/use-user-role";
import { createBrowserClient } from "@/lib/supabase/client";
import { ROLE_LABELS, canViewTeamClock } from "@/lib/user-roles";

type AppNavKey =
  | "dashboard"
  | "jobs"
  | "customers"
  | "upload"
  | "reference"
  | "team_time"
  | "team_clock";

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

function emailInitialLetter(email: string): string {
  const local = email.split("@")[0]?.trim() ?? "";
  const c = local[0] ?? email[0] ?? "?";
  return c.toUpperCase();
}

function drawerAvatarInitials(
  email: string,
  firstName: string | undefined,
  lastName: string | undefined,
): string {
  const f = firstName?.trim();
  const l = lastName?.trim();
  if (f && l && f[0] && l[0]) {
    return (f[0] + l[0]).toUpperCase();
  }
  return emailInitialLetter(email);
}

function MobileDrawerUserSection({ onNavigate }: { onNavigate: () => void }) {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { role, loading: roleLoading, profile } = useUserRole();

  useEffect(() => {
    const sb = createBrowserClient();
    let cancelled = false;
    void sb.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setEmail(data.session?.user?.email ?? null);
        setReady(true);
      }
    });
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    if (
      !window.confirm(
        "Sign out of Blueprint AI? You will need to sign in again to continue.",
      )
    ) {
      return;
    }
    const sb = createBrowserClient();
    await sb.auth.signOut();
    window.location.href = "/login";
  }, []);

  if (!ready) {
    return (
      <div
        className="mx-1 h-16 animate-pulse rounded-lg bg-white/10"
        aria-hidden
      />
    );
  }

  if (!email) {
    return null;
  }

  const roleLabel =
    !roleLoading && role ? ROLE_LABELS[role] : roleLoading ? "…" : null;

  return (
    <div className="mx-1 rounded-xl border border-white/12 bg-[#071422]/60 px-3 py-3">
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E8C84A] text-lg font-bold text-[#0a1628]"
          aria-hidden
        >
          {drawerAvatarInitials(
            email,
            profile?.first_name,
            profile?.last_name,
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="break-all text-sm font-medium leading-snug text-white">
            {email}
          </p>
          {roleLabel ? (
            <span className="mt-1 inline-block rounded-md bg-[#E8C84A]/18 px-2 py-0.5 text-[11px] font-semibold text-[#E8C84A]">
              {roleLabel}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="touch-target-sm shrink-0 rounded-lg px-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          aria-expanded={expanded}
          aria-label={expanded ? "Hide account actions" : "Show account actions"}
          onClick={() => setExpanded((e) => !e)}
        >
          <span
            className={`inline-block text-lg transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
            aria-hidden
          >
            ▼
          </span>
        </button>
      </div>
      {expanded ? (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
          <Link
            href="/dashboard"
            className="block rounded-lg px-2 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/10"
            onClick={onNavigate}
          >
            Profile & account
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-center text-xs font-semibold text-[#E8C84A] transition-colors hover:bg-[#E8C84A]/10"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
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
  const showTeamClock = !roleLoading && canViewTeamClock(role);
  useEffect(() => setMounted(true), []);

  const dashActive = pathname.startsWith("/dashboard");
  const jobsActive = pathname.startsWith("/jobs");
  const custActive = pathname.startsWith("/customers");
  const uploadActive = pathname === "/upload";
  const refActive = pathname.startsWith("/reference");
  const toolsActive = pathname.startsWith("/tools");
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
        <div className="shrink-0 border-b border-white/10 px-2 pb-3 pt-1">
          <MobileDrawerUserSection onNavigate={onClose} />
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
            Project Dashboard
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
          <p className="mt-3 border-t border-white/10 px-3 pb-2 pt-3 text-[10px] font-bold uppercase tracking-wide text-[#E8C84A]/80">
            Team
          </p>
          {showUserManagement ? (
            <Link
              href="/admin/users"
              className={linkClass(pathname.startsWith("/admin/users"))}
              onClick={onClose}
            >
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden>⚙️</span>
                User Management
              </span>
            </Link>
          ) : null}
          <Link
            href="/timesheets"
            className={linkClass(pathname.startsWith("/timesheets"))}
            onClick={onClose}
          >
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden>📋</span>
              Timesheets
            </span>
          </Link>
          <Link
            href="/time-off"
            className={linkClass(pathname.startsWith("/time-off"))}
            onClick={onClose}
          >
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden>🏖️</span>
              Time off
              <PendingTimeOffNavBadge />
            </span>
          </Link>
          <Link
            href="/calendar"
            className={linkClass(pathname.startsWith("/calendar"))}
            onClick={onClose}
          >
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden>📅</span>
              Calendar
            </span>
          </Link>
          <Link
            href="/jobs/daily-logs"
            className={linkClass(pathname.startsWith("/jobs/daily-logs"))}
            onClick={onClose}
          >
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden>📝</span>
              Daily Logs
            </span>
          </Link>
          {showTeamClock ? (
            <Link
              href="/team-clock"
              className={linkClass(pathname.startsWith("/team-clock"))}
              onClick={onClose}
            >
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden>🕐</span>
                Team Clock
                <TeamClockNavBadge />
              </span>
            </Link>
          ) : null}
          <Link
            href="/reference"
            className={linkClass(refActive)}
            onClick={onClose}
          >
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden>📚</span>
              Reference
            </span>
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
