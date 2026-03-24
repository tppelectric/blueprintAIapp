/** Static index entries for global nav search (no DB). */
export type StaticSearchHit = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  category: "nec" | "wire" | "conduit" | "reference" | "tool";
};

export const STATIC_SEARCH_INDEX: StaticSearchHit[] = [
  {
    id: "tool-load",
    title: "Load Calculator",
    subtitle: "NEC Article 220",
    href: "/tools/load-calculator",
    category: "tool",
  },
  {
    id: "tool-nec",
    title: "NEC Checker",
    subtitle: "Residential checklist",
    href: "/tools/nec-checker",
    category: "tool",
  },
  {
    id: "tool-wifi",
    title: "Wi‑Fi Analyzer",
    href: "/tools/wifi-analyzer",
    category: "tool",
  },
  {
    id: "tool-pb",
    title: "Project breakdown",
    href: "/tools/project-breakdown",
    category: "tool",
  },
  {
    id: "tool-eref",
    title: "Electrical Reference",
    subtitle: "Ampacity, conduit, voltage drop",
    href: "/tools/electrical-reference",
    category: "reference",
  },
  {
    id: "tool-motor",
    title: "Motor & HVAC Calculator",
    subtitle: "NEC 430, MCA/MOCP, transformers",
    href: "/tools/motor-hvac-calculator",
    category: "tool",
  },
  {
    id: "nec-210",
    title: "NEC 210 — Branch circuits",
    href: "/tools/nec-checker",
    category: "nec",
  },
  {
    id: "nec-220",
    title: "NEC 220 — Load calculations",
    href: "/tools/load-calculator",
    category: "nec",
  },
  {
    id: "nec-250",
    title: "NEC 250 — Grounding",
    href: "/tools/electrical-reference",
    category: "nec",
  },
  {
    id: "nec-310",
    title: "NEC 310 — Ampacity & conductors",
    href: "/tools/electrical-reference",
    category: "nec",
  },
  {
    id: "nec-430",
    title: "NEC 430 — Motors",
    href: "/tools/motor-hvac-calculator",
    category: "nec",
  },
  {
    id: "wire-12",
    title: "12 AWG copper ampacity",
    subtitle: "Typical 20A branch",
    href: "/tools/electrical-reference",
    category: "wire",
  },
  {
    id: "wire-10",
    title: "10 AWG copper ampacity",
    href: "/tools/electrical-reference",
    category: "wire",
  },
  {
    id: "conduit-fill",
    title: "Conduit fill calculator",
    href: "/tools/electrical-reference",
    category: "conduit",
  },
  {
    id: "vd",
    title: "Voltage drop calculator",
    href: "/tools/electrical-reference",
    category: "reference",
  },
];

export function filterStaticSearch(q: string): StaticSearchHit[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return STATIC_SEARCH_INDEX.filter(
    (h) =>
      h.title.toLowerCase().includes(s) ||
      (h.subtitle?.toLowerCase().includes(s) ?? false) ||
      h.id.includes(s),
  ).slice(0, 12);
}
