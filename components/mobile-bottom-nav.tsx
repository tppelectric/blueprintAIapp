"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items: { href: string; label: string; icon: string }[] = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/jobs", label: "Jobs", icon: "📋" },
  { href: "/tools", label: "Tools", icon: "🔧" },
  { href: "/dashboard", label: "Account", icon: "👤" },
];

export function MobileBottomNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      className="safe-bottom fixed bottom-0 left-0 right-0 z-[65] border-t border-white/10 bg-[#0a1628]/98 backdrop-blur-md md:hidden"
      aria-label="Mobile primary"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around gap-0 px-1">
        {items.map(({ href, label, icon }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href} className="min-w-0 flex-1">
              <Link
                href={href}
                className={[
                  "flex min-h-[48px] flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium leading-tight",
                  active ? "text-[#E8C84A]" : "text-white/65",
                ].join(" ")}
              >
                <span className="text-base" aria-hidden>
                  {icon}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
