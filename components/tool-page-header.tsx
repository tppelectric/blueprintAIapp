import type { ReactNode } from "react";
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
    <header className="border-b border-white/10 bg-[#071422]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div className="flex min-w-0 items-start gap-4">
          <TppLogoPill size="tool" />
          <div className="min-w-0 border-l border-[#E8C84A]/35 pl-4">
            <h1 className="text-xl font-semibold tracking-tight text-white">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 text-sm text-[#E8C84A]/95">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {children}
      </div>
    </header>
  );
}
