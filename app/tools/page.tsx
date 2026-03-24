import Link from "next/link";
import { ToolPageHeader } from "@/components/tool-page-header";

const tools = [
  {
    href: "/tools/load-calculator",
    title: "Load Calculator",
    desc: "NEC Article 220 service sizing",
    tone: "border-sky-500/40 text-sky-100",
  },
  {
    href: "/tools/electrical-reference",
    title: "Electrical Reference",
    desc: "Ampacity, conduit fill, voltage drop, cheat sheets",
    tone: "border-emerald-500/45 text-emerald-100",
  },
  {
    href: "/tools/motor-hvac-calculator",
    title: "Motor & HVAC Calculator",
    desc: "NEC 430 FLA, MCA/MOCP, transformers, generators",
    tone: "border-amber-500/45 text-amber-100",
  },
  {
    href: "/tools/nec-checker",
    title: "NEC Checker",
    desc: "Residential checklist & NEC Q&A",
    tone: "border-violet-500/40 text-violet-100",
  },
  {
    href: "/tools/wifi-analyzer",
    title: "Wi‑Fi Analyzer",
    desc: "Coverage planning & project breakdown",
    tone: "border-[#E8C84A]/50 text-[#E8C84A]",
  },
  {
    href: "/tools/project-breakdown",
    title: "Project breakdown",
    desc: "Cost, markup, sell price, and profit",
    tone: "border-amber-500/45 text-amber-100",
  },
  {
    href: "/dashboard/symbols",
    title: "Symbol library",
    desc: "Reusable electrical symbols",
    tone: "border-white/25 text-white/85",
  },
];

export default function ToolsHubPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <ToolPageHeader title="Tools" subtitle="Calculators, checklists & planners" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <ul className="space-y-4">
          {tools.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`tool-surface-card block border p-6 transition-opacity hover:opacity-95 ${t.tone}`}
              >
                <h2 className="text-lg font-semibold text-[var(--foreground)]">
                  {t.title}
                </h2>
                <p className="tool-muted mt-2 text-sm">{t.desc}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
