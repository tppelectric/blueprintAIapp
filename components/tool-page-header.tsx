import type { ReactNode } from "react";
import Link from "next/link";
import { HeaderAuthMenu } from "@/components/header-auth-menu";
import { GlobalNavSearch } from "@/components/global-nav-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { TppLogoPill } from "@/components/tpp-logo-pill";

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
        <div className="mx-auto max-w-5xl px-6 pt-4">
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
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <TppLogoPill size="tool" />
          <div className="min-w-0 border-l border-[#E8C84A]/35 pl-4">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {subtitle ? (
              <p className="tool-subtitle mt-1 text-sm">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:max-w-md sm:flex-1 sm:items-end">
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:justify-end">
            <GlobalNavSearch />
            <ThemeToggle />
            <HeaderAuthMenu />
          </div>
          {children ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {children}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
