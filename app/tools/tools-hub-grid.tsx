"use client";

import Link from "next/link";
import { ToolResultsSkeleton } from "@/components/app-polish";
import { useUserRole } from "@/hooks/use-user-role";
import { isFinancialToolHref } from "@/lib/user-roles";

export type ToolCard = {
  href: string;
  title: string;
  desc: string;
  tone: string;
};

export function ToolsHubGrid({ tools }: { tools: ToolCard[] }) {
  const { canAccessFinancialTools, loading } = useUserRole();

  const visible = tools.filter((t) => {
    if (loading) return true;
    if (isFinancialToolHref(t.href) && !canAccessFinancialTools) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <ToolResultsSkeleton rows={6} />
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {visible.map((t) => (
        <li key={t.href}>
          <Link
            href={t.href}
            className={`app-card app-card-pad-lg card-pad-mobile block transition-colors hover:border-[#E8C84A]/35 ${t.tone}`}
          >
            <h2 className="text-base font-semibold text-[var(--foreground)]">
              {t.title}
            </h2>
            <p className="tool-muted mt-2 text-sm leading-relaxed">
              {t.desc}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
