"use client";

import { useMemo } from "react";
import {
  computeProposalTierColumns,
  type ProposalTierId,
} from "@/lib/wifi-proposal-tiers";
import { formatMoneyCell } from "@/lib/wifi-project-cost";
import type { WifiAnalyzerInputs } from "@/lib/wifi-analyzer-engine";

type Props = {
  inputs: WifiAnalyzerInputs;
  onSelectTier: (tier: ProposalTierId) => void;
  toast: string | null;
};

export function WifiProposalTiersCard({
  inputs,
  onSelectTier,
  toast,
}: Props) {
  const cols = useMemo(
    () => computeProposalTierColumns(inputs),
    [inputs],
  );

  return (
    <section className="rounded-2xl border border-emerald-500/30 bg-emerald-950/15 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-emerald-100">
          Proposal tiers — Good / Better / Best
        </h2>
        {toast ? (
          <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-200">
            {toast}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-white/55">
        Select a tier to update the vendor stack, recalculate costs, and refresh
        the project breakdown.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {cols.map((c) => {
          const featured = c.id === "better";
          return (
            <div
              key={c.id}
              className={`flex flex-col rounded-xl border p-4 ${
                featured
                  ? "border-[#E8C84A]/55 bg-[#2a2310]/25 ring-2 ring-[#E8C84A]/30"
                  : "border-white/12 bg-white/[0.03]"
              }`}
            >
              {featured ? (
                <span className="mb-2 inline-flex w-fit rounded-full bg-[#E8C84A]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#E8C84A]">
                  Most popular
                </span>
              ) : null}
              <h3 className="text-base font-bold text-white">{c.title}</h3>
              <p className="text-xs font-medium text-[#E8C84A]/90">
                {c.subtitle}
              </p>
              <ul className="mt-3 flex-1 space-y-1 text-xs text-white/70">
                {c.blurb.map((line, i) => (
                  <li key={i}>• {line}</li>
                ))}
              </ul>
              <div className="mt-4 space-y-1 rounded-lg border border-white/10 bg-black/20 p-3 text-xs">
                <p className="font-medium text-white/85">AP model</p>
                <p className="text-white/70">{c.apModel}</p>
                <p className="mt-2 text-white/60">
                  Qty <span className="text-white">{c.apQty}</span>
                  {" · "}
                  <span className="text-[#E8C84A]">
                    Total {formatMoneyCell(c.apTotal)}
                  </span>
                </p>
                <p className="text-white/50">
                  Full materials (mid):{" "}
                  {formatMoneyCell(c.results.materialSubtotalMid)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSelectTier(c.id)}
                className={`mt-4 w-full rounded-lg py-2.5 text-sm font-bold ${
                  c.id === "good"
                    ? "bg-emerald-600 text-white hover:bg-emerald-500"
                    : c.id === "better"
                      ? "bg-[#E8C84A] text-[#0a1628] hover:bg-[#f0d56a]"
                      : "bg-sky-600 text-white hover:bg-sky-500"
                }`}
              >
                Select
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
