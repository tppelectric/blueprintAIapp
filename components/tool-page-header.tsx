import type { ReactNode } from "react";
import { HeaderAuthMenu } from "@/components/header-auth-menu";
import { GlobalNavSearch } from "@/components/global-nav-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { TppLogoPill } from "@/components/tpp-logo-pill";

export function ToolPageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <header className="app-tool-header border-b">
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
          <GlobalNavSearch className="w-full" />
          <div className="flex flex-wrap items-center justify-end gap-3">
            {children}
            <ThemeToggle />
            <HeaderAuthMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
