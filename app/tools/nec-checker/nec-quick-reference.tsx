"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

type CardDef = {
  id: string;
  title: string;
  category: "gfci" | "afci" | "kitchen" | "bathroom" | "service" | "outlet" | "nys";
  body: ReactNode;
};

const CARD_STYLES: Record<
  CardDef["category"],
  string
> = {
  gfci:
    "border-sky-500/45 bg-sky-950/25 hover:border-sky-400/55 print:border-sky-700 print:bg-sky-50",
  afci:
    "border-orange-500/45 bg-orange-950/25 hover:border-orange-400/55 print:border-orange-700 print:bg-orange-50",
  kitchen:
    "border-emerald-500/45 bg-emerald-950/25 hover:border-emerald-400/55 print:border-emerald-700 print:bg-emerald-50",
  bathroom:
    "border-teal-500/45 bg-teal-950/25 hover:border-teal-400/55 print:border-teal-700 print:bg-teal-50",
  service:
    "border-red-500/45 bg-red-950/25 hover:border-red-400/55 print:border-red-700 print:bg-red-50",
  outlet:
    "border-indigo-500/45 bg-indigo-950/25 hover:border-indigo-400/55 print:border-indigo-700 print:bg-indigo-50",
  nys:
    "border-violet-500/45 bg-violet-950/25 hover:border-violet-400/55 print:border-violet-700 print:bg-violet-50",
};

const CARDS: CardDef[] = [
  {
    id: "gfci",
    title: "GFCI requirements (NEC 210.8)",
    category: "gfci",
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-white/85 print:text-black">
        <p className="font-medium text-white print:text-black">Required locations:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Bathrooms — all receptacles</li>
          <li>Garages — all receptacles</li>
          <li>Outdoors — all receptacles</li>
          <li>Crawl spaces — all receptacles</li>
          <li>Unfinished basements — all receptacles</li>
          <li>Kitchen countertops — within 6 ft of sink</li>
          <li>Boathouses — all receptacles</li>
          <li>Within 6 ft of any sink</li>
          <li>Bathtubs and shower areas</li>
          <li>Indoor pool/spa areas</li>
        </ul>
        <p className="rounded-md border border-sky-400/30 bg-sky-950/40 px-3 py-2 text-sky-100/95 print:border-sky-300 print:bg-white print:text-sky-900">
          <strong>NYS 2023:</strong> Expanded to all 125V–250V receptacles in garages and
          unfinished basements.
        </p>
      </div>
    ),
  },
  {
    id: "afci",
    title: "AFCI requirements (NEC 210.12)",
    category: "afci",
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-white/85 print:text-black">
        <p className="font-medium text-white print:text-black">
          Required in ALL 120V 15A and 20A circuits in:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Bedrooms</li>
          <li>Living rooms</li>
          <li>Dining rooms</li>
          <li>Kitchens</li>
          <li>Hallways</li>
          <li>Closets</li>
          <li>Laundry areas</li>
          <li>Sunrooms and recreation rooms</li>
        </ul>
        <p className="rounded-md border border-orange-400/30 bg-orange-950/40 px-3 py-2 text-orange-100/95 print:border-orange-300 print:bg-white print:text-orange-950">
          <strong>NYS 2023:</strong> Required on ALL 120V 15A and 20A circuits in dwelling
          units.
        </p>
      </div>
    ),
  },
  {
    id: "kitchen",
    title: "Kitchen requirements (NEC 210.52)",
    category: "kitchen",
    body: (
      <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-white/85 print:text-black">
        <li>Minimum 2 small appliance circuits (20A)</li>
        <li>Receptacles on all counter spaces 12&quot;+ wide</li>
        <li>No point on counter more than 24&quot; from an outlet</li>
        <li>Refrigerator: dedicated 15A or 20A circuit</li>
        <li>Dishwasher: dedicated 15A or 20A circuit</li>
        <li>Garbage disposal: dedicated circuit</li>
        <li>All countertop receptacles must be GFCI</li>
        <li>
          Island/peninsula: receptacle required if 12&quot; wide and 24&quot; long or
          greater
        </li>
      </ul>
    ),
  },
  {
    id: "bathroom",
    title: "Bathroom requirements",
    category: "bathroom",
    body: (
      <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-white/85 print:text-black">
        <li>Dedicated 20A circuit (NEC 210.11(C)(1))</li>
        <li>All receptacles must be GFCI (NEC 210.8(A))</li>
        <li>Receptacle within 3 ft of basin (NEC 210.52(D))</li>
        <li>No receptacles in shower/tub zone</li>
        <li>Exhaust fan recommended (IRC requirement)</li>
        <li>Switch height: 48&quot; AFF typical</li>
      </ul>
    ),
  },
  {
    id: "service",
    title: "Service sizing (NEC 220)",
    category: "service",
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-white/85 print:text-black">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>100A service:</strong> Small homes under 1000 sq ft; no electric heat or
            range
          </li>
          <li>
            <strong>150A service:</strong> Medium homes, some electric loads
          </li>
          <li>
            <strong>200A service:</strong> Standard new construction; required for new
            single-family in NYS 2023
          </li>
          <li>
            <strong>400A service:</strong> Large homes, EV + heat pump; all-electric homes
          </li>
        </ul>
        <p className="rounded-md border border-white/15 bg-black/30 px-3 py-2 font-mono text-xs text-white/90 print:border-gray-300 print:bg-gray-100 print:text-black">
          Quick formula:
          <br />
          Sq ft × 3 VA + 10,000 VA base ÷ 240V = Amps
        </p>
      </div>
    ),
  },
  {
    id: "outlet",
    title: "Outlet spacing (NEC 210.52(A))",
    category: "outlet",
    body: (
      <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-white/85 print:text-black">
        <li>No point on wall more than 6 ft from an outlet</li>
        <li>Measured along floor line</li>
        <li>Any wall 2 ft+ wide needs an outlet</li>
        <li>Hallways 10 ft+ need one outlet</li>
        <li>Countertops: no point more than 24&quot; from an outlet</li>
        <li>Bathroom: within 3 ft of basin edge</li>
      </ul>
    ),
  },
  {
    id: "nys",
    title: "NYS specific rules",
    category: "nys",
    body: (
      <div className="space-y-4 text-sm leading-relaxed text-white/85 print:text-black">
        <div>
          <p className="font-semibold text-violet-200 print:text-violet-900">
            Permits AFTER December 30, 2025:
          </p>
          <ul className="mt-1 list-disc pl-5">
            <li>2023 NEC required</li>
            <li>200A minimum service for new single-family homes</li>
            <li>AFCI on ALL 120V 15A/20A circuits</li>
            <li>GFCI expanded requirements apply</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-violet-200 print:text-violet-900">
            Permits ON OR BEFORE December 30, 2025:
          </p>
          <ul className="mt-1 list-disc pl-5">
            <li>May use 2017 NEC (confirm with AHJ)</li>
            <li>Recommend upgrading to 2023 for best practice</li>
          </ul>
        </div>
        <div className="rounded-md border border-violet-400/30 bg-violet-950/40 px-3 py-2 text-violet-100/95 print:border-violet-300 print:bg-white print:text-violet-950">
          <p className="font-medium">Key contacts</p>
          <p className="mt-1">
            <strong>AHJ</strong> = Authority Having Jurisdiction (your local building
            department). Always verify with the local inspector.
          </p>
        </div>
      </div>
    ),
  },
];

export function NecQuickReferenceGuides() {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const toggle = useCallback((id: string) => {
    setOpen((p) => ({ ...p, [id]: !p[id] }));
  }, []);

  useEffect(() => {
    const hash = (window.location.hash || "").replace(/^#/, "").trim();
    if (!hash.startsWith("nec-ref-")) return;
    const cardId = hash.slice("nec-ref-".length);
    if (!CARDS.some((c) => c.id === cardId)) return;
    setOpen((p) => ({ ...p, [cardId]: true }));
    const t = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 print:break-inside-avoid">
      <h2 className="text-lg font-semibold text-white print:text-black">
        Quick Reference Guides
      </h2>
      <p className="mt-1 text-sm text-white/55 print:text-gray-700">
        Tap any card to expand
      </p>
      <div className="mt-4 space-y-2">
        {CARDS.map((c) => {
          const isOpen = open[c.id];
          return (
            <div
              key={c.id}
              id={`nec-ref-${c.id}`}
              className={`scroll-mt-24 overflow-hidden rounded-xl border-2 transition-colors print:break-inside-avoid ${CARD_STYLES[c.category]}`}
            >
              <button
                type="button"
                onClick={() => toggle(c.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left print:cursor-default"
                aria-expanded={isOpen}
              >
                <span className="text-sm font-semibold text-white print:text-black">
                  {c.title}
                </span>
                <span className="shrink-0 text-white/60 print:text-black" aria-hidden>
                  {isOpen ? "▼" : "▶"}
                </span>
              </button>
              <div
                className={`border-t border-white/10 px-4 py-4 print:block print:border-gray-200 ${
                  isOpen ? "block" : "hidden print:block"
                }`}
              >
                {c.body}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
