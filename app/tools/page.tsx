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
    href: "/tools/av-analyzer",
    title: "AV Analyzer",
    desc: "Distributed audio, theater & display planning",
    tone: "border-rose-500/45 text-rose-100",
  },
  {
    href: "/tools/smarthome-analyzer",
    title: "Smart Home Analyzer",
    desc: "Automation, lighting & control design",
    tone: "border-cyan-500/45 text-cyan-100",
  },
  {
    href: "/tools/project-breakdown",
    title: "Project breakdown",
    desc: "Cost, markup, sell price, and profit",
    tone: "border-amber-500/45 text-amber-100",
  },
  {
    href: "/tools/project-describer",
    title: "AI Project Describer",
    desc: "Voice or text → scope, BOM, proposals, analyzer pre-fill",
    tone: "border-fuchsia-500/45 text-fuchsia-100",
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
      <ToolPageHeader
        title="Tools"
        subtitle="Calculators, checklists & planners"
        showToolsBackLink={false}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <nav
          className="mb-10 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-medium"
          aria-label="Leave tools hub"
        >
          <Link
            href="/dashboard"
            className="text-[#E8C84A] transition-colors hover:text-[#f0d56e]"
          >
            ← Dashboard
          </Link>
          <span className="text-white/30" aria-hidden>
            |
          </span>
          <Link
            href="/"
            className="text-white/75 transition-colors hover:text-[#E8C84A]"
          >
            🏠 Home
          </Link>
        </nav>
        <ul className="space-y-4">
          {tools.map((t) => (
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
      </main>
    </div>
  );
}
