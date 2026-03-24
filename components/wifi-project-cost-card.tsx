"use client";

import { useMemo, useState } from "react";
import type { WifiAnalyzerResults } from "@/lib/wifi-analyzer-engine";
import {
  buildProjectCostSummary,
  formatMoneyCell,
  formatUsd,
} from "@/lib/wifi-project-cost";

type Props = {
  results: WifiAnalyzerResults;
  laborRatePerHour: number;
  onLaborRatePerHourChange: (n: number) => void;
  onExportBomPdf: () => void | Promise<void>;
  onExportBomCsv: () => void;
};

const tableHead =
  "bg-[#E8C84A]/15 text-left text-[10px] font-bold uppercase tracking-wide text-[#E8C84A]";

export function WifiProjectCostCard({
  results,
  laborRatePerHour,
  onLaborRatePerHourChange,
  onExportBomPdf,
  onExportBomCsv,
}: Props) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const summary = useMemo(
    () => buildProjectCostSummary(results, laborRatePerHour),
    [results, laborRatePerHour],
  );

  const matMid = summary.materialSubtotalMid;
  const hasBom = (results.hardwareBomLines ?? []).length > 0;

  return (
    <section className="rounded-2xl border-2 border-[#E8C84A]/50 bg-gradient-to-b from-[#2a2310]/40 via-[#0a1628] to-[#071018] p-6 shadow-lg shadow-black/25 ring-1 ring-[#E8C84A]/20">
      <h2 className="text-lg font-bold tracking-tight text-[#E8C84A]">
        Projected project cost
      </h2>
      <p className="mt-1 text-xs text-white/50">
        Planning estimate only — not a binding quote. Taxes, shipping, dealer
        pricing, and field changes not included.
      </p>

      {!hasBom && matMid <= 0 ? (
        <p className="mt-4 text-sm text-amber-200/90">
          Run <strong>Calculate coverage</strong> again to load itemized BOM
          lines for this vendor.
        </p>
      ) : null}

      <div className="mt-6">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#E8C84A]/90">
          Materials breakdown
        </h3>
        <div className="overflow-x-auto rounded-lg border border-[#E8C84A]/25">
          <table className="w-full min-w-[520px] border-collapse text-sm text-white/90">
            <thead>
              <tr className={tableHead}>
                <th className="px-3 py-2">Item</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2 text-center">Unit</th>
                <th className="px-2 py-2 text-right">Unit cost</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {summary.materialRows.map((row) => (
                <tr
                  key={row.key}
                  className="border-t border-white/8 odd:bg-white/[0.03]"
                >
                  <td className="max-w-[240px] px-3 py-2 text-white/88">
                    {row.item}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {row.qty}
                  </td>
                  <td className="px-2 py-2 text-center text-white/70">
                    {row.unit}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-[#E8C84A]/95">
                    {formatMoneyCell(row.unitCost)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums text-[#E8C84A]">
                    {formatMoneyCell(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex justify-end border-t border-dashed border-[#E8C84A]/30 pt-3 text-sm font-semibold text-white">
          <span className="text-white/70">Material subtotal</span>
          <span className="ml-4 text-[#E8C84A]">{formatMoneyCell(matMid)}</span>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-white/10 pt-5 text-sm">
        <span className="font-medium text-white/85">Your labor rate:</span>
        <span className="text-white/50">$</span>
        <input
          type="number"
          min={40}
          max={250}
          step={1}
          value={laborRatePerHour}
          onChange={(e) =>
            onLaborRatePerHourChange(
              Math.min(250, Math.max(40, Number(e.target.value) || 85)),
            )
          }
          className="w-20 rounded border border-[#E8C84A]/35 bg-[#0a1628] px-2 py-1.5 text-white"
        />
        <span className="text-white/60">/hr</span>
        <span className="text-xs text-white/40">(updates labor costs instantly)</span>
      </div>

      <div className="mt-4">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#E8C84A]/90">
          Labor breakdown
        </h3>
        <div className="overflow-x-auto rounded-lg border border-[#E8C84A]/25">
          <table className="w-full min-w-[480px] border-collapse text-sm text-white/90">
            <thead>
              <tr className={tableHead}>
                <th className="px-3 py-2 text-left">Task</th>
                <th className="px-2 py-2 text-right">Hours</th>
                <th className="px-2 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {summary.laborLines.map((L) => (
                <tr
                  key={L.id}
                  className="border-t border-white/8 odd:bg-white/[0.03]"
                >
                  <td className="px-3 py-2 text-white/88">{L.taskLabel}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-white/75">
                    {L.hours} hrs
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-emerald-200/90">
                    {formatMoneyCell(L.rate)}/hr
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums text-emerald-200">
                    {formatMoneyCell(L.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex justify-end border-t border-dashed border-[#E8C84A]/30 pt-3 text-sm font-semibold text-white">
          <span className="text-white/70">
            Labor subtotal ({summary.totalLaborHours} total hours)
          </span>
          <span className="ml-4 text-emerald-200">
            {formatMoneyCell(summary.laborSubtotal)}
          </span>
        </div>
      </div>

      <div className="mt-8 border-t-2 border-[#E8C84A]/45 pt-5 text-sm">
        <div className="flex justify-between text-white/80">
          <span>Materials (mid estimate)</span>
          <span className="tabular-nums text-[#E8C84A]">
            {formatMoneyCell(matMid)}
          </span>
        </div>
        <div className="mt-2 flex justify-between text-white/80">
          <span>Labor (at your rate)</span>
          <span className="tabular-nums text-emerald-200">
            {formatMoneyCell(summary.laborSubtotal)}
          </span>
        </div>
        <div className="my-3 border-t border-[#E8C84A]/35" />
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <span className="text-base font-bold text-white">
            Total estimate
          </span>
          <span className="text-xl font-bold text-[#E8C84A]">
            {formatUsd(summary.totalLow)} – {formatUsd(summary.totalHigh)}
          </span>
        </div>
        <p className="mt-2 text-xs text-white/45">
          Range uses ~−15% / +20% on material subtotal; labor held at your
          hourly rate above.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pdfBusy || !hasBom}
          onClick={() => {
            setPdfBusy(true);
            void Promise.resolve(onExportBomPdf()).finally(() =>
              setPdfBusy(false),
            );
          }}
          className="rounded-lg border-2 border-[#E8C84A]/60 bg-[#E8C84A]/20 px-4 py-2.5 text-sm font-bold text-[#E8C84A] hover:bg-[#E8C84A]/30 disabled:opacity-50"
        >
          {pdfBusy ? "PDF…" : "Export bill of materials (PDF)"}
        </button>
        <button
          type="button"
          disabled={!hasBom}
          onClick={onExportBomCsv}
          className="rounded-lg border border-[#E8C84A]/40 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
        >
          Export bill of materials (CSV)
        </button>
      </div>
      <p className="mt-3 text-[10px] text-white/40">
        PDF &amp; CSV include TPP Electrical Contractors Inc. branding and full
        itemized breakdown.
      </p>
    </section>
  );
}
