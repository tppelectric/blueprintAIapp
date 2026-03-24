"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const TOOL_LINKS: { href: string; label: string }[] = [
  { href: "/tools/wifi-analyzer", label: "Wi‑Fi Analyzer" },
  { href: "/tools/av-analyzer", label: "AV Analyzer" },
  { href: "/tools/smarthome-analyzer", label: "Smart Home Analyzer" },
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const toolsPathActive =
    pathname.startsWith("/tools") || pathname.startsWith("/customers");

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
      {open ? (
        <div
          className="absolute left-1/2 top-full z-[60] mt-2 w-[min(100vw-2rem,16rem)] -translate-x-1/2 rounded-xl border border-white/15 bg-[#0a1628] py-2 shadow-xl sm:left-0 sm:translate-x-0"
          role="menu"
          onMouseDown={(e) => e.preventDefault()}
        >
          <Link
            href="/customers"
            role="menuitem"
            className="block px-4 py-2.5 text-sm font-medium text-white/90 hover:bg-white/10"
            onClick={() => setOpen(false)}
          >
            Customers
          </Link>
          <div className="mx-2 border-t border-white/10" />
          <p className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-[#E8C84A]/80">
            Tools
          </p>
          {TOOL_LINKS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              role="menuitem"
              className={`block px-4 py-2 text-sm hover:bg-white/10 ${
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
            className="block px-4 py-2.5 text-sm text-white/70 hover:bg-white/10"
            onClick={() => setOpen(false)}
          >
            All tools hub →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
