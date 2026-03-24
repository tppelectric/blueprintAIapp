"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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

export function AppMobileNavButton({
  variant,
  active,
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

  const onBackdrop = useCallback(() => setOpen(false), []);

  const dashActive = active === "dashboard" || pathname.startsWith("/dashboard");
  const jobsActive = active === "jobs" || pathname.startsWith("/jobs");
  const custActive = active === "customers" || pathname.startsWith("/customers");
  const uploadActive = active === "upload" || pathname === "/upload";
  const toolsActive = pathname.startsWith("/tools");
  const homeActive = pathname === "/";

  return (
    <>
      <button
        type="button"
        className="touch-target-md inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/10 px-3 text-lg text-white md:hidden"
        aria-expanded={open}
        aria-label="Open navigation menu"
        onClick={() => setOpen(true)}
      >
        ☰
      </button>

      <div
        className={[
          "fixed inset-0 z-[100000] md:hidden transition-[visibility] duration-300",
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
            "absolute inset-0 z-[100000] bg-black/60 transition-opacity duration-300 ease-out",
            open ? "opacity-100" : "opacity-0",
          ].join(" ")}
          aria-label="Close menu"
          onClick={onBackdrop}
          tabIndex={open ? 0 : -1}
        />
        <div
          className={[
            "absolute right-0 top-0 z-[100001] flex h-full w-[min(100vw-2.5rem,20rem)] flex-col border-l border-white/10 bg-[#0a1628] shadow-2xl transition-transform duration-300 ease-out",
            open ? "translate-x-0" : "translate-x-full",
          ].join(" ")}
        >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-sm font-semibold text-white">Menu</span>
              <button
                type="button"
                className="touch-target-sm rounded-lg px-3 text-lg text-white/80 hover:bg-white/10"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
            <nav
              className="flex-1 overflow-y-auto px-3 py-4"
              aria-label="Primary"
            >
              <Link
                href="/"
                className={linkClass(variant === "marketing" ? homeActive : homeActive)}
                onClick={() => setOpen(false)}
              >
                Home
              </Link>
              <Link
                href="/dashboard"
                className={linkClass(dashActive)}
                onClick={() => setOpen(false)}
              >
                Dashboard
              </Link>
              <Link
                href="/jobs"
                className={linkClass(jobsActive)}
                onClick={() => setOpen(false)}
              >
                Jobs
              </Link>
              <Link
                href="/customers"
                className={linkClass(custActive)}
                onClick={() => setOpen(false)}
              >
                Customers
              </Link>
              <Link
                href="/tools"
                className={linkClass(toolsActive)}
                onClick={() => setOpen(false)}
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
                  onClick={() => setOpen(false)}
                >
                  {t.label}
                </Link>
              ))}
              <Link
                href="/upload"
                className={linkClass(uploadActive)}
                onClick={() => setOpen(false)}
              >
                Upload
              </Link>
              {variant === "marketing" ? (
                <>
                  <a
                    href="#product"
                    className={linkClass(false)}
                    onClick={() => setOpen(false)}
                  >
                    Product
                  </a>
                  <a
                    href="#contact"
                    className={linkClass(false)}
                    onClick={() => setOpen(false)}
                  >
                    Contact
                  </a>
                </>
              ) : null}
            </nav>
        </div>
      </div>
    </>
  );
}
