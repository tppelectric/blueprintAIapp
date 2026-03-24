"use client";

import { useMemo, useState } from "react";
import type { ElectricalItemRow } from "@/lib/electrical-item-types";
import type { DetectedRoomRow } from "@/lib/detected-room-types";
import {
  runTakeoffExport,
  type TakeoffExportFormat,
  type TakeoffExportInclude,
  type TakeoffExportProjectInput,
  type TakeoffOrganizeBy,
} from "@/lib/scan-export";
import type { TakeoffCategoryExportScope } from "@/lib/takeoff-category";

const DEFAULT_INCLUDE: TakeoffExportInclude = {
  aiCounts: true,
  manualCounts: true,
  finalCounts: true,
  confidence: true,
  planNotes: true,
  summaryTotals: true,
  lowConfidenceFlagged: false,
};

type ExportFormatChoice =
  | "full_pdf"
  | "schedule_pdf"
  | "csv_estimate"
  | "csv_materials";

export function TakeoffExportDialog({
  open,
  onClose,
  projectName,
  totalPagesScanned,
  sheets,
  docNumPages,
  items,
  rooms,
  manualCounts,
  manualMode,
  filterPages,
  filterRoom,
  title = "Export Takeoff Report",
}: {
  open: boolean;
  onClose: () => void;
  projectName: string;
  totalPagesScanned: number;
  sheets: Array<{ sheet_name: string; sheet_order: number }>;
  docNumPages: number[];
  items: ElectricalItemRow[];
  rooms: DetectedRoomRow[];
  manualCounts: Record<string, number>;
  manualMode: boolean;
  filterPages?: Set<number>;
  filterRoom?: Pick<DetectedRoomRow, "id" | "page_number" | "room_name">;
  title?: string;
}) {
  const [formatChoice, setFormatChoice] =
    useState<ExportFormatChoice>("full_pdf");
  const [organizeBy, setOrganizeBy] =
    useState<TakeoffOrganizeBy>("room_floor");
  const [include, setInclude] = useState<TakeoffExportInclude>(DEFAULT_INCLUDE);
  const [allCategories, setAllCategories] = useState(true);
  const [scope, setScope] = useState<
    Record<Exclude<TakeoffCategoryExportScope, "all">, boolean>
  >({
    fixtures: false,
    receptacles: false,
    switches: false,
    panels: false,
    plan_notes: false,
    low_voltage: false,
    wiring: false,
  });

  const categoryScopes = useMemo((): TakeoffCategoryExportScope[] => {
    if (allCategories) return ["all"];
    const picks = (
      Object.entries(scope) as [TakeoffCategoryExportScope, boolean][]
    )
      .filter(([k, v]) => k !== "all" && v)
      .map(([k]) => k);
    return picks.length ? picks : ["all"];
  }, [allCategories, scope]);

  if (!open) return null;

  const toggleInclude = (key: keyof TakeoffExportInclude) => {
    setInclude((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleScope = (key: Exclude<TakeoffCategoryExportScope, "all">) => {
    setAllCategories(false);
    setScope((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const runExport = () => {
    const input: TakeoffExportProjectInput = {
      projectName,
      analyzedAt: new Date(),
      totalPagesScanned,
      docNumPages,
      sheets,
      items,
      rooms,
      manualCounts,
      manualMode,
      filterPages,
      filterRoom,
    };

    const mapFormat = (): TakeoffExportFormat => {
      switch (formatChoice) {
        case "full_pdf":
          return "pdf";
        case "schedule_pdf":
          return "pdf_schedule";
        case "csv_estimate":
          return "csv";
        case "csv_materials":
          return "csv_materials";
        default:
          return "pdf";
      }
    };

    runTakeoffExport(input, mapFormat(), organizeBy, include, {
      categoryScopes,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[240] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#0a1628] p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="takeoff-export-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="takeoff-export-title"
          className="text-lg font-semibold text-white"
        >
          {title}
        </h2>

        <fieldset className="mt-5 border-0 p-0">
          <legend className="text-sm font-semibold text-white/90">
            Categories to include
          </legend>
          <div className="mt-2 space-y-2 text-sm text-white/85">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={allCategories}
                onChange={() => {
                  setAllCategories(true);
                  setScope({
                    fixtures: false,
                    receptacles: false,
                    switches: false,
                    panels: false,
                    plan_notes: false,
                    low_voltage: false,
                    wiring: false,
                  });
                }}
                className="accent-sky-500"
              />
              All items
            </label>
            <p className="text-[11px] text-white/45">
              Or limit export to specific groups:
            </p>
            {(
              [
                ["fixtures", "Fixtures only"],
                ["receptacles", "Receptacles only"],
                ["switches", "Switches only"],
                ["panels", "Panels only"],
                ["plan_notes", "Plan notes only"],
                ["low_voltage", "Low voltage only"],
                ["wiring", "Wiring only"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={!allCategories && scope[key]}
                  disabled={allCategories}
                  onChange={() => toggleScope(key)}
                  className="accent-emerald-500 disabled:opacity-40"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-5 border-0 p-0">
          <legend className="text-sm font-semibold text-white/90">Format</legend>
          <div className="mt-2 space-y-2 text-sm text-white/85">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="takeoff-format-v2"
                checked={formatChoice === "full_pdf"}
                onChange={() => setFormatChoice("full_pdf")}
                className="accent-sky-500"
              />
              Full report PDF
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="takeoff-format-v2"
                checked={formatChoice === "schedule_pdf"}
                onChange={() => setFormatChoice("schedule_pdf")}
                className="accent-sky-500"
              />
              Schedule format PDF (print from browser)
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="takeoff-format-v2"
                checked={formatChoice === "csv_estimate"}
                onChange={() => setFormatChoice("csv_estimate")}
                className="accent-sky-500"
              />
              CSV for estimating (line-by-line)
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="takeoff-format-v2"
                checked={formatChoice === "csv_materials"}
                onChange={() => setFormatChoice("csv_materials")}
                className="accent-sky-500"
              />
              Materials takeoff CSV (grouped quantities)
            </label>
          </div>
        </fieldset>

        <fieldset className="mt-5 border-0 p-0">
          <legend className="text-sm font-semibold text-white/90">
            Organize by
          </legend>
          <div className="mt-2 space-y-2 text-sm text-white/85">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="takeoff-organize"
                checked={organizeBy === "room_floor"}
                onChange={() => setOrganizeBy("room_floor")}
                className="accent-violet-500"
              />
              Room and Floor
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="takeoff-organize"
                checked={organizeBy === "category"}
                onChange={() => setOrganizeBy("category")}
                className="accent-violet-500"
              />
              Category only
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="takeoff-organize"
                checked={organizeBy === "page"}
                onChange={() => setOrganizeBy("page")}
                className="accent-violet-500"
              />
              Page number only
            </label>
          </div>
        </fieldset>

        <fieldset className="mt-5 border-0 p-0">
          <legend className="text-sm font-semibold text-white/90">Include</legend>
          <div className="mt-2 grid gap-2 text-sm text-white/85">
            {(
              [
                ["aiCounts", "AI counts"],
                ["manualCounts", "Manual counts (if available)"],
                ["finalCounts", "Final verified counts"],
                ["confidence", "Confidence scores"],
                ["planNotes", "Plan notes"],
                ["summaryTotals", "Summary totals"],
                ["lowConfidenceFlagged", "Low confidence items flagged"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={include[key]}
                  onChange={() => toggleInclude(key)}
                  className="accent-emerald-500"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={runExport}
            className="rounded-lg border border-emerald-500/50 bg-emerald-600/90 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
