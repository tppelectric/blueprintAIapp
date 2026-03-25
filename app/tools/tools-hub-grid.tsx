"use client";

import Link from "next/link";
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

  return (
    <ul className="space-y-4">
      {visible.map((t) => (
        <li key={t.href}>
          <Link
            href={t.href}
            className={`tool-surface-card card-pad-mobile block border p-5 transition-opacity hover:opacity-95 sm:p-6 ${t.tone}`}
          >
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              {t.title}
            </h2>
            <p className="tool-muted mt-2 text-sm">{t.desc}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
