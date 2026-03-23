"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ToolPageHeader } from "@/components/tool-page-header";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  computeWifiPlan,
  type BudgetTier,
  type BuildingType,
  type CeilingHeight,
  type CoverageGoal,
  type DeviceBand,
  type PoeChoice,
  type VendorChoice,
  type WallMaterial,
  type WifiAnalyzerInputs,
  type WifiAnalyzerResults,
} from "@/lib/wifi-analyzer-engine";
import { downloadWifiAnalysisPdf } from "@/lib/wifi-analyzer-pdf";

const WALLS: {
  id: WallMaterial;
  label: string;
  detail: string;
}[] = [
  {
    id: "drywall",
    label: "Drywall",
    detail: "Least interference — ~2,500 sq ft per AP (baseline)",
  },
  {
    id: "wood",
    label: "Wood frame",
    detail: "Low interference — ~2,000 sq ft per AP",
  },
  {
    id: "metal_stud",
    label: "Metal stud",
    detail: "Medium interference — ~1,500 sq ft per AP",
  },
  {
    id: "brick",
    label: "Brick",
    detail: "Medium–high interference — ~1,200 sq ft per AP",
  },
  {
    id: "concrete",
    label: "Concrete block",
    detail: "High interference — ~800 sq ft per AP",
  },
];

function buildCsv(inputs: WifiAnalyzerInputs, r: WifiAnalyzerResults): string {
  const lines = [
    "TPP Electrical Contractors Inc. — Wi-Fi takeoff export",
    `Project,${inputs.projectName}`,
    `Building,${inputs.buildingType}`,
    "",
    "Metric,Value",
    `Recommended_APs,${r.recommendedAps}`,
    `Indoor_APs,${r.indoorAps}`,
    `Outdoor_APs,${r.outdoorAps}`,
    `CAT6_LF,${r.cat6FootageLf}`,
    `CAT6_Drops,${r.cat6Drops}`,
    `LV_Brackets_EA,${r.lvBrackets}`,
    `RJ45_Jacks_EA,${r.rj45Jacks}`,
    `Patch_cables_EA,${r.patchCables}`,
    `PoE_switch_ports,${r.poeSwitchPorts}`,
    `AP_model,${r.equipment.apModel}`,
    `Outdoor_AP,${r.equipment.outdoorApModel ?? ""}`,
    `Hardware_cost_estimate,"${r.hardwareCostEstimateLabel.replace(/"/g, '""')}"`,
  ];
  return lines.join("\r\n");
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="border-l-4 border-[#E8C84A] pl-3 text-sm font-bold uppercase tracking-wide text-white/90">
      {children}
    </h2>
  );
}

export function WifiAnalyzerClient() {
  const [projectName, setProjectName] = useState("");
  const [buildingType, setBuildingType] =
    useState<BuildingType>("residential");
  const [totalSqFt, setTotalSqFt] = useState(2500);
  const [floors, setFloors] = useState(1);
  const [coverageGoal, setCoverageGoal] =
    useState<CoverageGoal>("streaming");
  const [wallMaterial, setWallMaterial] = useState<WallMaterial>("drywall");
  const [ceilingHeight, setCeilingHeight] = useState<CeilingHeight>("9");
  const [deviceBand, setDeviceBand] = useState<DeviceBand>("11-25");
  const [outdoorNeeded, setOutdoorNeeded] = useState(false);
  const [poe, setPoe] = useState<PoeChoice>("recommend");
  const [vendor, setVendor] = useState<VendorChoice>("ubiquiti");
  const [budget, setBudget] = useState<BudgetTier>("500_1500");

  const [results, setResults] = useState<WifiAnalyzerResults | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const inputs: WifiAnalyzerInputs = useMemo(
    () => ({
      projectName: projectName.trim() || "Untitled",
      buildingType,
      totalSqFt: Math.max(1, totalSqFt),
      floors: Math.max(1, floors),
      coverageGoal,
      wallMaterial,
      ceilingHeight,
      deviceBand,
      outdoorNeeded,
      poe,
      vendor,
      budget,
    }),
    [
      projectName,
      buildingType,
      totalSqFt,
      floors,
      coverageGoal,
      wallMaterial,
      ceilingHeight,
      deviceBand,
      outdoorNeeded,
      poe,
      vendor,
      budget,
    ],
  );

  const runCalc = useCallback(() => {
    setResults(computeWifiPlan(inputs));
    setSaveMsg(null);
  }, [inputs]);

  const exportPdf = () => {
    if (!results) return;
    void downloadWifiAnalysisPdf(inputs, results);
  };

  const exportCsv = () => {
    if (!results) return;
    const blob = new Blob([buildCsv(inputs, results)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wifi-takeoff-${(projectName || "export").replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveToSupabase = async () => {
    if (!results) {
      setSaveMsg("Run Calculate first.");
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const sb = createBrowserClient();
      const { error } = await sb.from("wifi_calculations").insert({
        project_name: inputs.projectName,
        building_type: buildingType,
        inputs_json: inputs as unknown as Record<string, unknown>,
        results_json: results as unknown as Record<string, unknown>,
        equipment_json: results.equipment as unknown as Record<string, unknown>,
      });
      if (error) throw error;
      setSaveMsg("Saved to database.");
    } catch (e) {
      setSaveMsg(
        e instanceof Error ? e.message : "Save failed (run Supabase SQL?).",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a1628] text-white">
      <ToolPageHeader
        title="Wi-Fi Network Analyzer & Planner"
        subtitle="Coverage planning for residential and commercial installations"
      >
        <Link
          href="/dashboard"
          className="text-sm font-medium text-[#E8C84A] hover:text-[#f0d56e]"
        >
          ← Dashboard
        </Link>
      </ToolPageHeader>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="space-y-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <section className="space-y-4">
            <SectionTitle>Project setup</SectionTitle>
            <label className="block text-sm">
              <span className="text-white/70">Project name</span>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                placeholder="e.g. Smith residence — Wi-Fi upgrade"
              />
            </label>
            <label className="block text-sm">
              <span className="text-white/70">Building type</span>
              <select
                value={buildingType}
                onChange={(e) =>
                  setBuildingType(e.target.value as BuildingType)
                }
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
              >
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="office">Office</option>
                <option value="warehouse">Warehouse</option>
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-white/70">Total square footage</span>
                <input
                  type="number"
                  min={1}
                  value={totalSqFt}
                  onChange={(e) =>
                    setTotalSqFt(Number(e.target.value) || 1)
                  }
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Number of floors</span>
                <input
                  type="number"
                  min={1}
                  max={80}
                  value={floors}
                  onChange={(e) =>
                    setFloors(Math.max(1, Number(e.target.value) || 1))
                  }
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-white/70">Coverage goal</span>
              <select
                value={coverageGoal}
                onChange={(e) =>
                  setCoverageGoal(e.target.value as CoverageGoal)
                }
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
              >
                <option value="basic">Basic browsing</option>
                <option value="streaming">Streaming</option>
                <option value="high_density_iot">High density IoT</option>
                <option value="smart_home">Smart home</option>
                <option value="commercial">Commercial grade</option>
              </select>
            </label>
          </section>

          <section className="space-y-4">
            <SectionTitle>Environment</SectionTitle>
            <p className="text-xs text-white/55">
              Wall material (rule-based sq ft per access point)
            </p>
            <div className="space-y-2">
              {WALLS.map((w) => (
                <label
                  key={w.id}
                  className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-3 text-left text-sm ${
                    wallMaterial === w.id
                      ? "border-[#E8C84A] bg-[#E8C84A]/10"
                      : "border-white/12 bg-[#0a1628]/60 hover:border-[#E8C84A]/35"
                  }`}
                >
                  <input
                    type="radio"
                    name="wall"
                    checked={wallMaterial === w.id}
                    onChange={() => setWallMaterial(w.id)}
                    className="mt-1 accent-[#E8C84A]"
                  />
                  <span>
                    <span className="font-semibold text-white">{w.label}</span>
                    <span className="mt-0.5 block text-xs text-white/55">
                      {w.detail}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <label className="block text-sm">
              <span className="text-white/70">Ceiling height</span>
              <select
                value={ceilingHeight}
                onChange={(e) =>
                  setCeilingHeight(e.target.value as CeilingHeight)
                }
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
              >
                <option value="8">8 ft</option>
                <option value="9">9 ft</option>
                <option value="10">10 ft</option>
                <option value="12">12 ft</option>
                <option value="higher">Higher / vaulted</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-white/70">Number of Wi-Fi devices (typical)</span>
              <select
                value={deviceBand}
                onChange={(e) =>
                  setDeviceBand(e.target.value as DeviceBand)
                }
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
              >
                <option value="1-10">1 – 10</option>
                <option value="11-25">11 – 25</option>
                <option value="26-50">26 – 50</option>
                <option value="50+">50+</option>
              </select>
            </label>
            <div>
              <span className="text-sm text-white/70">Outdoor coverage needed</span>
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="outdoor"
                    checked={!outdoorNeeded}
                    onChange={() => setOutdoorNeeded(false)}
                    className="accent-[#E8C84A]"
                  />
                  No
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="outdoor"
                    checked={outdoorNeeded}
                    onChange={() => setOutdoorNeeded(true)}
                    className="accent-[#E8C84A]"
                  />
                  Yes (+1 outdoor AP)
                </label>
              </div>
            </div>
            <div>
              <span className="text-sm text-white/70">PoE switch available</span>
              <div className="mt-2 flex flex-wrap gap-3">
                {(
                  [
                    ["yes", "Yes"],
                    ["no", "No"],
                    ["recommend", "Need one"],
                  ] as const
                ).map(([v, lab]) => (
                  <label
                    key={v}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="poe"
                      checked={poe === v}
                      onChange={() => setPoe(v)}
                      className="accent-[#E8C84A]"
                    />
                    {lab}
                  </label>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle>Vendor preference</SectionTitle>
            <div className="grid gap-2">
              {(
                [
                  ["ubiquiti", "Ubiquiti UniFi (recommended for most)"],
                  ["ruckus", "Ruckus"],
                  ["cisco_meraki", "Cisco Meraki"],
                  ["tp_link", "TP-Link Omada"],
                  ["access_networks", "Access Networks"],
                  ["none", "No preference (recommend best value)"],
                ] as const
              ).map(([v, lab]) => (
                <label
                  key={v}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    vendor === v
                      ? "border-[#E8C84A] bg-[#E8C84A]/10"
                      : "border-white/12 bg-[#0a1628]/60"
                  }`}
                >
                  <input
                    type="radio"
                    name="vendor"
                    checked={vendor === v}
                    onChange={() => setVendor(v)}
                    className="accent-[#E8C84A]"
                  />
                  {lab}
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle>Budget</SectionTitle>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["under500", "Under $500"],
                  ["500_1500", "$500 – $1,500"],
                  ["1500_5000", "$1,500 – $5,000"],
                  ["5000_plus", "$5,000+"],
                  ["unlimited", "No budget constraint"],
                ] as const
              ).map(([v, lab]) => (
                <label
                  key={v}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    budget === v
                      ? "border-[#E8C84A] bg-[#E8C84A]/10"
                      : "border-white/12 bg-[#0a1628]/60"
                  }`}
                >
                  <input
                    type="radio"
                    name="budget"
                    checked={budget === v}
                    onChange={() => setBudget(v)}
                    className="accent-[#E8C84A]"
                  />
                  {lab}
                </label>
              ))}
            </div>
          </section>

          <button
            type="button"
            onClick={runCalc}
            className="w-full rounded-xl border-2 border-[#E8C84A] bg-[#E8C84A] py-3 text-center text-sm font-bold text-[#0a1628] transition-colors hover:bg-[#f0d56e]"
          >
            Calculate coverage
          </button>
        </div>

        {results ? (
          <div className="mt-10 space-y-8">
            <section className="rounded-2xl border border-emerald-500/30 bg-emerald-950/25 p-6">
              <h2 className="text-lg font-semibold text-emerald-100">
                Coverage summary
              </h2>
              <ul className="mt-4 space-y-2 text-sm text-white/88">
                <li>
                  Recommended access points:{" "}
                  <strong className="text-[#E8C84A]">
                    {results.recommendedAps}
                  </strong>
                </li>
                <li>
                  Coverage per AP (avg): ~{results.coveragePerApSqFt} sq ft
                </li>
                <li>Total coverage (building): {results.totalCoverageSqFt} sq ft</li>
              </ul>
            </section>

            <section className="rounded-2xl border border-white/12 bg-white/[0.04] p-6">
              <h2 className="border-l-4 border-[#E8C84A] pl-3 text-lg font-semibold">
                Equipment recommendation
              </h2>
              <ul className="mt-4 space-y-2 text-sm text-white/85">
                <li>AP model: {results.equipment.apModel}</li>
                {results.equipment.outdoorApModel ? (
                  <li>Outdoor: {results.equipment.outdoorApModel}</li>
                ) : null}
                <li>{results.equipment.switchNote}</li>
                <li>Target PoE ports: {results.equipment.switchPorts}</li>
                <li>Budget tier: {results.estimatedHardwareCostRange}</li>
                <li className="font-medium text-[#E8C84A]">
                  Total estimated hardware: {results.hardwareCostEstimateLabel}
                </li>
                {poe === "recommend" ? (
                  <li className="text-white/60">
                    PoE: plan for a managed PoE+ switch sized to the port count
                    above (or larger stack for growth).
                  </li>
                ) : null}
              </ul>
            </section>

            <section className="rounded-2xl border border-sky-500/25 bg-sky-950/20 p-6">
              <h2 className="text-lg font-semibold text-sky-100">
                Cable runs (feeds electrical / LV takeoff)
              </h2>
              <ul className="mt-4 space-y-2 text-sm text-white/85">
                <li>CAT6 drops: {results.cat6Drops}</li>
                <li>Estimated CAT6 footage: {results.cat6FootageLf} LF</li>
                <li>{results.switchLocationNote}</li>
                <li>Low-voltage bracket count: {results.lvBrackets}</li>
              </ul>
            </section>

            <section className="rounded-2xl border border-white/10 p-6">
              <h2 className="text-lg font-semibold text-white">
                Low-voltage materials list
              </h2>
              <table className="mt-4 w-full text-left text-sm">
                <tbody className="divide-y divide-white/10">
                  <tr>
                    <td className="py-2 text-white/65">CAT6 cable</td>
                    <td className="py-2 font-medium">{results.cat6FootageLf} LF</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-white/65">Low-voltage brackets</td>
                    <td className="py-2 font-medium">{results.lvBrackets} EA</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-white/65">RJ45 keystone jacks</td>
                    <td className="py-2 font-medium">{results.rj45Jacks} EA</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-white/65">
                      PoE switch ({results.poeSwitchPorts} port target)
                    </td>
                    <td className="py-2 font-medium">1 EA</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-white/65">Wireless APs (indoor)</td>
                    <td className="py-2 font-medium">{results.indoorAps} EA</td>
                  </tr>
                  {results.outdoorAps > 0 ? (
                    <tr>
                      <td className="py-2 text-white/65">
                        Wireless APs (outdoor)
                      </td>
                      <td className="py-2 font-medium">
                        {results.outdoorAps} EA
                      </td>
                    </tr>
                  ) : null}
                  <tr>
                    <td className="py-2 text-white/65">Patch cables</td>
                    <td className="py-2 font-medium">
                      {results.patchCables} EA
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <p className="text-xs leading-relaxed text-white/50">
              Results based on: {results.assumptionsLine}. Actual coverage may
              vary. Professional site survey recommended for large or complex
              installations.
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={exportPdf}
                className="rounded-lg border border-[#E8C84A]/50 bg-[#E8C84A]/15 px-4 py-2 text-sm font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/25"
              >
                Export PDF
              </button>
              <button
                type="button"
                onClick={exportCsv}
                className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Export CSV
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveToSupabase()}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save calculation"}
              </button>
            </div>
            {saveMsg ? (
              <p className="text-sm text-white/70">{saveMsg}</p>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}
