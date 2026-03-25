/** Static items used by Reference Library search (no server index). */

import { quickReferenceCardsSearchHits } from "@/lib/reference-quick-cards";

export type ReferenceSearchHit = {
  kind: "cheat" | "card" | "doc";
  title: string;
  subtitle?: string;
  href?: string;
  keywords: string;
  documentId?: string;
  anchorId?: string;
  printId?: string;
};

export const REFERENCE_CHEAT_SHEET_HITS: ReferenceSearchHit[] = [
  {
    kind: "cheat",
    title: "Wire Ampacity Table",
    subtitle: "Electrical Reference — Section 1",
    href: "/tools/electrical-reference#eref-section-wire-ampacity",
    keywords:
      "wire ampacity gauge awg nec 310 table conductor copper aluminum thhn",
  },
  {
    kind: "cheat",
    title: "Conduit Fill Calculator",
    subtitle: "Electrical Reference — Section 2",
    href: "/tools/electrical-reference#eref-section-conduit-fill",
    keywords:
      "conduit fill emt pvc chapter 9 percent overfill wire count calculator",
  },
  {
    kind: "cheat",
    title: "Voltage Drop Calculator",
    subtitle: "Electrical Reference — Section 3",
    href: "/tools/electrical-reference#eref-section-voltage-drop",
    keywords:
      "voltage drop vd percent branch feeder 210.19 distance calculator",
  },
  {
    kind: "cheat",
    title: "Motor FLA Tables",
    subtitle: "Electrical Reference — motor circuits (NEC 430)",
    href: "/tools/electrical-reference#eref-c5",
    keywords:
      "motor fla full load amp table 430 conductor overload breaker fuse",
  },
  {
    kind: "cheat",
    title: "GFCI Requirements (NEC 210.8)",
    subtitle: "NEC Checker — quick guide",
    href: "/tools/nec-checker#nec-ref-gfci",
    keywords:
      "gfci ground fault bathroom kitchen garage outdoor basement sink nec 210.8",
  },
  {
    kind: "cheat",
    title: "AFCI Requirements (NEC 210.12)",
    subtitle: "NEC Checker — quick guide",
    href: "/tools/nec-checker#nec-ref-afci",
    keywords:
      "afci arc fault bedroom living kitchen laundry dwelling nec 210.12",
  },
  {
    kind: "cheat",
    title: "Box Fill Calculations",
    subtitle: "Electrical Reference — quick card",
    href: "/tools/electrical-reference#eref-c7",
    keywords:
      "box fill 314.16 cubic inch device conductor ground clamp calculation",
  },
  {
    kind: "cheat",
    title: "Standard Breaker Sizes",
    subtitle: "Electrical Reference — quick card",
    href: "/tools/electrical-reference#eref-c1",
    keywords:
      "breaker sizes 15 20 30 40 50 60 100 200 amp 240.6 standard",
  },
  {
    kind: "cheat",
    title: "Service Entrance Sizing",
    subtitle: "NEC Checker — service sizing (NEC 220)",
    href: "/tools/nec-checker#nec-ref-service",
    keywords:
      "service entrance 100a 150a 200a 400a meter disconnect load calculation nec 220",
  },
];

export const REFERENCE_QUICK_CARD_HITS: ReferenceSearchHit[] =
  quickReferenceCardsSearchHits();

export function scoreSearch(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  if (t.includes(q)) return 100;
  const parts = q.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const p of parts) {
    if (t.includes(p)) score += 20;
  }
  return score;
}
