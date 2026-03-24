"use client";

import { useEffect, useRef, useState } from "react";
import { ProjectBreakdownEditor } from "@/components/project-breakdown-editor";
import {
  seedProjectBreakdownFromWifi,
  type ProjectBreakdownState,
} from "@/lib/project-breakdown";
import { buildProjectCostSummary } from "@/lib/wifi-project-cost";
import type {
  VendorChoice,
  WifiAnalyzerResults,
} from "@/lib/wifi-analyzer-engine";

type Props = {
  results: WifiAnalyzerResults;
  calcGeneration: number;
  laborRatePerHour: number;
  onLaborRatePerHourChange: (n: number) => void;
  projectName: string;
  wifiVendor: VendorChoice;
};

export function WifiProjectCostCard({
  results,
  calcGeneration,
  laborRatePerHour,
  onLaborRatePerHourChange,
  projectName,
  wifiVendor,
}: Props) {
  const seededGen = useRef<number | null>(null);
  const [pb, setPb] = useState<ProjectBreakdownState>(() =>
    seedProjectBreakdownFromWifi(
      buildProjectCostSummary(results, laborRatePerHour),
      { laborRatePerHour, wifiVendor },
    ),
  );

  useEffect(() => {
    const summary = buildProjectCostSummary(results, laborRatePerHour);
    if (seededGen.current !== calcGeneration) {
      seededGen.current = calcGeneration;
      setPb(
        seedProjectBreakdownFromWifi(summary, {
          laborRatePerHour,
          wifiVendor,
        }),
      );
      return;
    }
    setPb((p) =>
      p.laborRatePerHour === laborRatePerHour ? p : { ...p, laborRatePerHour },
    );
  }, [calcGeneration, results, laborRatePerHour, wifiVendor]);

  const onPbChange = (next: ProjectBreakdownState) => {
    setPb(next);
    if (next.laborRatePerHour !== laborRatePerHour) {
      onLaborRatePerHourChange(next.laborRatePerHour);
    }
  };

  const hasBom = (results.hardwareBomLines ?? []).length > 0;
  const matMid = results.materialSubtotalMid ?? 0;

  return (
    <section className="rounded-2xl border-2 border-[#E8C84A]/50 bg-gradient-to-b from-[#2a2310]/40 via-[#0a1628] to-[#071018] p-6 shadow-lg shadow-black/25 ring-1 ring-[#E8C84A]/20">
      <h2 className="text-lg font-bold tracking-tight text-[#E8C84A]">
        Project breakdown
      </h2>
      <p className="mt-1 text-xs text-white/50">
        Planning estimate — cost, markup, sell price, and profit by line. Not a
        binding quote.
      </p>

      {!hasBom && matMid <= 0 ? (
        <p className="mt-4 text-sm text-amber-200/90">
          Run <strong>Calculate coverage</strong> again to load materials from
          this vendor.
        </p>
      ) : null}

      <div className="mt-6">
        <ProjectBreakdownEditor
          variant="compact"
          state={pb}
          onChange={onPbChange}
          projectTitle={projectName || "Wi‑Fi project"}
        />
      </div>
    </section>
  );
}
