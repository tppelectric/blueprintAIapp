"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ToolPageHeader } from "@/components/tool-page-header";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  computeWifiPlan,
  scoreRoom,
  type BudgetTier,
  type BuildingType,
  type CeilingHeight,
  type CoverageGoal,
  type PoeChoice,
  type PlanningPriority,
  type RoomTypeOption,
  type RoomWallMaterial,
  type VendorChoice,
  type WifiAnalyzerInputs,
  type WifiAnalyzerResults,
  type WifiRoomInput,
} from "@/lib/wifi-analyzer-engine";
import { downloadWifiAnalysisPdf } from "@/lib/wifi-analyzer-pdf";

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function exampleRooms(): WifiRoomInput[] {
  return [
    {
      id: newId(),
      name: "Living room",
      floor: 1,
      lengthFt: 18,
      widthFt: 14,
      roomType: "living_room",
      wallMaterial: "drywall",
      outdoor: false,
      ceilingHeight: "9",
      expectedDevices: 14,
    },
    {
      id: newId(),
      name: "Primary bedroom",
      floor: 2,
      lengthFt: 14,
      widthFt: 12,
      roomType: "bedroom",
      wallMaterial: "drywall",
      outdoor: false,
      ceilingHeight: "8",
      expectedDevices: 8,
    },
    {
      id: newId(),
      name: "Back patio",
      floor: 1,
      lengthFt: 12,
      widthFt: 10,
      roomType: "patio",
      wallMaterial: "brick",
      outdoor: true,
      ceilingHeight: "higher",
      expectedDevices: 4,
    },
  ];
}

const ROOM_TYPES: { value: RoomTypeOption; label: string }[] = [
  { value: "living_room", label: "Living room" },
  { value: "bedroom", label: "Bedroom" },
  { value: "office", label: "Office" },
  { value: "kitchen", label: "Kitchen" },
  { value: "bathroom", label: "Bathroom" },
  { value: "hallway", label: "Hallway" },
  { value: "garage", label: "Garage" },
  { value: "basement", label: "Basement" },
  { value: "patio", label: "Patio" },
  { value: "outdoor", label: "Outdoor area" },
  { value: "other", label: "Other" },
];

const ROOM_WALLS: { value: RoomWallMaterial; label: string }[] = [
  { value: "drywall", label: "Drywall" },
  { value: "plaster", label: "Plaster" },
  { value: "brick", label: "Brick" },
  { value: "concrete_block", label: "Concrete block" },
  { value: "mixed", label: "Mixed" },
];

function buildCsv(inputs: WifiAnalyzerInputs, r: WifiAnalyzerResults): string {
  const lines = [
    "TPP Electrical Contractors Inc. — Wi-Fi takeoff export",
    `Project,${inputs.projectName}`,
    `Building,${inputs.buildingType}`,
    `Internet_Mbps,${inputs.internetSpeedMbps}`,
    `Planning_priority,${inputs.planningPriority}`,
    `Rooms_complete,${r.completeRooms}/${r.totalRooms}`,
    "",
    "Metric,Value",
    `Recommended_APs_total,${r.recommendedAps}`,
    `Indoor_APs,${r.indoorAps}`,
    `Outdoor_APs,${r.outdoorAps}`,
    `Indoor_sq_ft,${r.totalIndoorSqFt}`,
    `Devices_total,${r.totalDevices}`,
    `CAT6_LF,${r.cat6FootageLf}`,
    `CAT6_Drops,${r.cat6Drops}`,
    `LV_Brackets_EA,${r.lvBrackets}`,
    `RJ45_Jacks_EA,${r.rj45Jacks}`,
    `Patch_cables_EA,${r.patchCables}`,
    `PoE_switch_ports,${r.poeSwitchPorts}`,
    `Whole_home_AP_plan,"${r.equipment.wholeHomeApPlan.replace(/"/g, '""')}"`,
    `Gateway,"${r.gatewayRecommendation.replace(/"/g, '""')}"`,
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
  const [rooms, setRooms] = useState<WifiRoomInput[]>(exampleRooms);
  const [planningPriority, setPlanningPriority] =
    useState<PlanningPriority>("best_value");
  const [internetSpeedMbps, setInternetSpeedMbps] = useState(1000);
  const [coverageGoal, setCoverageGoal] =
    useState<CoverageGoal>("streaming");
  const [poe, setPoe] = useState<PoeChoice>("recommend");
  const [vendor, setVendor] = useState<VendorChoice>("ubiquiti");
  const [budget, setBudget] = useState<BudgetTier>("500_1500");

  const [results, setResults] = useState<WifiAnalyzerResults | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  const inputs: WifiAnalyzerInputs = useMemo(
    () => ({
      projectName: projectName.trim() || "Untitled",
      buildingType,
      rooms,
      planningPriority,
      internetSpeedMbps: Math.max(1, internetSpeedMbps || 1),
      coverageGoal,
      poe,
      vendor,
      budget,
    }),
    [
      projectName,
      buildingType,
      rooms,
      planningPriority,
      internetSpeedMbps,
      coverageGoal,
      poe,
      vendor,
      budget,
    ],
  );

  const updateRoom = (id: string, patch: Partial<WifiRoomInput>) => {
    setRooms((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  };

  const addRoom = () => {
    setRooms((prev) => [
      ...prev,
      {
        id: newId(),
        name: "",
        floor: 1,
        lengthFt: 0,
        widthFt: 0,
        roomType: "other",
        wallMaterial: "drywall",
        outdoor: false,
        ceilingHeight: "9",
        expectedDevices: 0,
      },
    ]);
  };

  const removeRoom = (id: string) => {
    setRooms((prev) => prev.filter((r) => r.id !== id));
  };

  const runCalc = useCallback(() => {
    setResults(computeWifiPlan(inputs));
    setSaveMsg(null);
    setCopyMsg(null);
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

  const copySummary = async () => {
    if (!results?.summaryText) return;
    try {
      await navigator.clipboard.writeText(results.summaryText);
      setCopyMsg("Copied summary to clipboard.");
      window.setTimeout(() => setCopyMsg(null), 2500);
    } catch {
      setCopyMsg("Could not copy.");
    }
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
            <label className="block text-sm">
              <span className="text-white/70">Internet speed (Mbps)</span>
              <input
                type="number"
                min={1}
                value={internetSpeedMbps}
                onChange={(e) =>
                  setInternetSpeedMbps(Number(e.target.value) || 1000)
                }
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
              />
            </label>
            <div>
              <span className="text-sm text-white/70">Planning priority</span>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["best_value", "Best value"],
                    ["best_performance", "Best performance"],
                    ["future_proof", "Future-proof"],
                    ["lowest_cost", "Lowest cost"],
                  ] as const
                ).map(([v, lab]) => (
                  <label
                    key={v}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      planningPriority === v
                        ? "border-[#E8C84A] bg-[#E8C84A]/15"
                        : "border-white/15 bg-[#0a1628]/80"
                    }`}
                  >
                    <input
                      type="radio"
                      name="priority"
                      checked={planningPriority === v}
                      onChange={() => setPlanningPriority(v)}
                      className="accent-[#E8C84A]"
                    />
                    {lab}
                  </label>
                ))}
              </div>
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

          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle>Rooms</SectionTitle>
              <button
                type="button"
                onClick={addRoom}
                className="rounded-lg border border-[#E8C84A]/50 bg-[#E8C84A]/10 px-3 py-1.5 text-sm font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/20"
              >
                Add room
              </button>
            </div>
            <p className="text-xs text-white/50">
              Enter each space; square footage is length × width. Outdoor rooms
              add outdoor APs when area ≥ 80 sq ft.
            </p>
            <div className="space-y-4">
              {rooms.map((room) => {
                const area = room.lengthFt * room.widthFt;
                const complete =
                  Boolean(room.name.trim()) &&
                  room.lengthFt > 0 &&
                  room.widthFt > 0;
                const sc = scoreRoom(room, planningPriority);
                const zone = complete
                  ? (() => {
                      if (room.outdoor) return "Outdoor coverage zone";
                      if (room.roomType === "office" && room.expectedDevices >= 8)
                        return "High-demand office";
                      if (sc >= 12) return "Primary coverage zone";
                      if (sc >= 8) return "Shared coverage zone";
                      if (sc >= 5) return "Transition zone";
                      return "Likely shared coverage";
                    })()
                  : "—";
                return (
                  <div
                    key={room.id}
                    className="rounded-xl border border-white/12 bg-[#0a1628]/50 p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#E8C84A]/90">
                          {zone}
                        </p>
                        <p className="text-xs text-white/45">
                          Score: {complete ? sc : "—"} · Calc. area:{" "}
                          {area > 0 ? `${Math.round(area)} sq ft` : "—"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRoom(room.id)}
                        className="text-xs font-medium text-red-300/90 hover:text-red-200"
                      >
                        Remove
                      </button>
                    </div>
                    {!complete ? (
                      <p className="mb-2 text-xs text-amber-200/90">
                        Incomplete: add name, length, and width.
                      </p>
                    ) : null}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm sm:col-span-2">
                        <span className="text-white/70">Room name</span>
                        <input
                          value={room.name}
                          onChange={(e) =>
                            updateRoom(room.id, { name: e.target.value })
                          }
                          className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="text-white/70">Floor</span>
                        <select
                          value={room.floor}
                          onChange={(e) =>
                            updateRoom(room.id, {
                              floor: Number(e.target.value) as 1 | 2 | 3 | 4,
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                        >
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                          <option value={4}>4</option>
                        </select>
                      </label>
                      <label className="block text-sm">
                        <span className="text-white/70">Room type</span>
                        <select
                          value={room.roomType}
                          onChange={(e) =>
                            updateRoom(room.id, {
                              roomType: e.target.value as RoomTypeOption,
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                        >
                          {ROOM_TYPES.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm">
                        <span className="text-white/70">Length (ft)</span>
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={room.lengthFt || ""}
                          onChange={(e) =>
                            updateRoom(room.id, {
                              lengthFt: Number(e.target.value) || 0,
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="text-white/70">Width (ft)</span>
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={room.widthFt || ""}
                          onChange={(e) =>
                            updateRoom(room.id, {
                              widthFt: Number(e.target.value) || 0,
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                        />
                      </label>
                      <label className="block text-sm sm:col-span-2">
                        <span className="text-white/70">Wall material</span>
                        <select
                          value={room.wallMaterial}
                          onChange={(e) =>
                            updateRoom(room.id, {
                              wallMaterial: e.target.value as RoomWallMaterial,
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                        >
                          {ROOM_WALLS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 text-sm sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={room.outdoor}
                          onChange={(e) =>
                            updateRoom(room.id, { outdoor: e.target.checked })
                          }
                          className="accent-[#E8C84A]"
                        />
                        Outdoor (not indoor)
                      </label>
                      <label className="block text-sm">
                        <span className="text-white/70">Ceiling height</span>
                        <select
                          value={room.ceilingHeight}
                          onChange={(e) =>
                            updateRoom(room.id, {
                              ceilingHeight: e.target.value as CeilingHeight,
                            })
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
                        <span className="text-white/70">Expected devices</span>
                        <input
                          type="number"
                          min={0}
                          value={room.expectedDevices}
                          onChange={(e) =>
                            updateRoom(room.id, {
                              expectedDevices: Math.max(
                                0,
                                Number(e.target.value) || 0,
                              ),
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
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
                  Total rooms: {results.totalRooms} (
                  {results.completeRooms} complete, {results.incompleteRooms}{" "}
                  incomplete)
                </li>
                <li>Total indoor sq ft: {results.totalIndoorSqFt}</li>
                <li>Total devices (summed): {results.totalDevices}</li>
                <li>
                  Recommended APs:{" "}
                  <strong className="text-[#E8C84A]">
                    {results.indoorAps} indoor + {results.outdoorAps} outdoor
                  </strong>{" "}
                  ({results.recommendedAps} total)
                </li>
                <li>
                  Avg indoor coverage per AP: ~{results.coveragePerApSqFt} sq
                  ft
                </li>
              </ul>
            </section>

            <section className="rounded-2xl border border-white/12 bg-white/[0.04] p-6">
              <h2 className="border-l-4 border-[#E8C84A] pl-3 text-lg font-semibold">
                Zone map
              </h2>
              <ul className="mt-4 space-y-2 text-sm text-white/85">
                {results.roomRows.map((row) => (
                  <li key={row.id}>
                    {row.complete ? (
                      <>
                        <span className="font-medium text-white">{row.name}</span>{" "}
                        (fl {row.floor}, {row.areaSqFt} sq ft) —{" "}
                        <span className="text-[#E8C84A]/95">{row.zoneType}</span>
                      </>
                    ) : (
                      <span className="text-amber-200/90">
                        {row.name} — incomplete ({row.incompleteReason})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-violet-500/25 bg-violet-950/20 p-6">
              <h2 className="text-lg font-semibold text-violet-100">
                Gateway
              </h2>
              <p className="mt-2 text-sm text-white/85">
                {results.gatewayRecommendation}
              </p>
            </section>

            <section className="rounded-2xl border border-white/12 bg-white/[0.04] p-6">
              <h2 className="border-l-4 border-[#E8C84A] pl-3 text-lg font-semibold">
                Whole-home AP plan
              </h2>
              <p className="mt-3 text-sm text-white/90">
                {results.equipment.wholeHomeApPlan}
              </p>
              <ul className="mt-3 space-y-1 text-sm text-white/70">
                <li>{results.equipment.switchNote}</li>
                <li>Target PoE ports: {results.equipment.switchPorts}</li>
                <li>Budget tier: {results.estimatedHardwareCostRange}</li>
                <li className="font-medium text-[#E8C84A]">
                  Total estimated hardware: {results.hardwareCostEstimateLabel}
                </li>
              </ul>
              {poe === "recommend" ? (
                <p className="mt-2 text-xs text-white/50">
                  PoE: size a managed PoE+ switch for the port count above.
                </p>
              ) : null}
            </section>

            <section className="rounded-2xl border border-sky-500/25 bg-sky-950/20 p-6">
              <h2 className="text-lg font-semibold text-sky-100">
                Low voltage (cable takeoff)
              </h2>
              <ul className="mt-4 space-y-2 text-sm text-white/85">
                <li>CAT6 drops: {results.cat6Drops}</li>
                <li>Estimated CAT6 footage: {results.cat6FootageLf} LF</li>
                <li>{results.switchLocationNote}</li>
                <li>Low-voltage brackets: {results.lvBrackets}</li>
              </ul>
            </section>

            <section className="rounded-2xl border border-white/10 p-6">
              <h2 className="text-lg font-semibold text-white">
                Materials list
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

            <section className="rounded-2xl border border-amber-500/25 bg-amber-950/20 p-6">
              <h2 className="text-lg font-semibold text-amber-100">Notes</h2>
              <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-white/80">
                <li>
                  AP count is planned for a whole-home layout, not one access
                  point per room.
                </li>
                {results.planNotes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
                {results.incompleteWarnings.map((w, i) => (
                  <li key={`w-${i}`} className="text-amber-200/95">
                    {w}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-white/50">{results.assumptionsLine}</p>
            </section>

            <div>
              <h3 className="text-sm font-semibold text-white/80">
                Full summary (copyable)
              </h3>
              <textarea
                readOnly
                value={results.summaryText}
                rows={14}
                className="mt-2 w-full resize-y rounded-lg border border-white/15 bg-[#071422] p-3 font-mono text-xs text-white/85"
              />
              <button
                type="button"
                onClick={() => void copySummary()}
                className="mt-2 rounded-lg border border-[#E8C84A]/50 bg-[#E8C84A]/15 px-4 py-2 text-sm font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/25"
              >
                Copy summary
              </button>
              {copyMsg ? (
                <p className="mt-1 text-xs text-emerald-300/90">{copyMsg}</p>
              ) : null}
            </div>

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
