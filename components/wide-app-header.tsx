import type { ReactNode } from "react";
import Link from "next/link";
import { TppLogoPill } from "@/components/tpp-logo-pill";
import { TPP_COMPANY_FULL, TPP_TAGLINE } from "@/lib/tpp-branding";

type NavKey = "home" | "dashboard" | "upload" | "symbols";

const activeNav =
  "border-b-2 border-[#E8C84A] pb-0.5 font-semibold text-[#E8C84A]";
const idleNav =
  "border-b-2 border-transparent pb-0.5 text-white/75 transition-colors hover:border-[#E8C84A]/55 hover:text-[#E8C84A]";

export function WideAppHeader({
  active,
  showTppSubtitle,
  extraLinks,
}: {
  active: NavKey;
  showTppSubtitle?: boolean;
  extraLinks?: ReactNode;
}) {
  return (
    <header className="border-b border-white/10 bg-[#071422]/80 backdrop-blur-md">
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3 sm:px-8">
        <Link
          href="/"
          className="flex min-w-0 max-w-[min(100%,28rem)] items-center gap-3 transition-opacity hover:opacity-95"
        >
          <TppLogoPill size="header" />
          <div className="min-w-0 text-left">
            <span className="block truncate text-lg font-semibold tracking-tight text-white">
              Blueprint AI
            </span>
            {showTppSubtitle ? (
              <span className="mt-0.5 block truncate text-xs font-semibold text-[#E8C84A] sm:text-sm">
                {TPP_COMPANY_FULL}
              </span>
            ) : (
              <span className="mt-0.5 hidden text-xs text-white/55 sm:block">
                {TPP_TAGLINE}
              </span>
            )}
          </div>
        </Link>
        <nav
          className="flex flex-wrap items-center gap-5 text-sm font-medium sm:gap-8"
          aria-label="Primary"
        >
          {active === "home" ? (
            <span className={activeNav}>Home</span>
          ) : (
            <Link href="/" className={idleNav}>
              Home
            </Link>
          )}
          {active === "dashboard" ? (
            <span className={activeNav}>Dashboard</span>
          ) : (
            <Link href="/dashboard" className={idleNav}>
              Dashboard
            </Link>
          )}
          {active === "symbols" ? (
            <span className={activeNav}>Symbol library</span>
          ) : (
            <Link href="/dashboard/symbols" className={idleNav}>
              Symbol library
            </Link>
          )}
          {active === "upload" ? (
            <span className={activeNav}>Upload</span>
          ) : (
            <Link href="/upload" className={idleNav}>
              Upload
            </Link>
          )}
          {extraLinks}
        </nav>
      </div>
    </header>
  );
}
