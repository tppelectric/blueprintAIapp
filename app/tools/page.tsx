import Link from "next/link";
import { ToolPageHeader } from "@/components/tool-page-header";
import { ToolsHubGrid, type ToolCard } from "./tools-hub-grid";

const tools: ToolCard[] = [
  {
    href: "/inventory",
    title: "Inventory & QR",
    desc: "Tools, materials, equipment, and QR scan check-in/out",
    tone: "border-violet-500/45 text-violet-100",
  },
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
    href: "/tools/electrical-analyzer",
    title: "Electrical Project Analyzer",
    desc: "Room-by-room circuits, panel & NEC-style estimates",
    tone: "border-lime-500/45 text-lime-100",
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
        <ToolsHubGrid tools={tools} />
      </main>
    </div>
  );
}
