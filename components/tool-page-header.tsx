import type { ReactNode } from "react";
import Link from "next/link";
import { HeaderAuthMenu } from "@/components/header-auth-menu";
import { GlobalNavSearch } from "@/components/global-nav-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { TppLogoPill } from "@/components/tpp-logo-pill";
import { AppMobileNavButton } from "@/components/app-mobile-nav";

export function ToolPageHeader({
  title,
  subtitle,
  children,
  showToolsBackLink = true,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  /** Set false on `/tools` hub so the bar is not redundant. */
  showToolsBackLink?: boolean;
}) {
  return (
    <header className="app-tool-header border-b">
      {showToolsBackLink ? (
        <div className="mx-auto max-w-6xl px-4 pt-4 md:px-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium sm:text-sm">
            <Link
              href="/dashboard"
              className="text-[#E8C84A] transition-colors hover:text-[#f0d56e]"
            >
              🏠 Home
            </Link>
            <span className="text-white/25" aria-hidden>
              |
            </span>
            <Link
              href="/tools"
              className="text-white/70 transition-colors hover:text-[#E8C84A]"
            >
              ← Back to Tools
            </Link>
          </div>
        </div>
      ) : null}
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-5 md:px-8 md:py-6 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
          <TppLogoPill size="tool" />
          <div className="min-w-0 border-l border-[#E8C84A]/35 pl-3 sm:pl-4">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {title}
            </h1>
            {subtitle ? (
              <p className="tool-subtitle mt-2 text-sm text-white/80">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex w-full flex-col gap-3 md:w-auto md:max-w-md md:flex-1 md:items-end">
          <div className="flex w-full flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            <div className="max-lg:!hidden items-center gap-1.5 sm:gap-2 lg:flex">
              <GlobalNavSearch />
              <ThemeToggle />
              <HeaderAuthMenu />
            </div>
            <div className="lg:hidden">
              <AppMobileNavButton variant="app" />
            </div>
          </div>
          {children ? (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              {children}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
