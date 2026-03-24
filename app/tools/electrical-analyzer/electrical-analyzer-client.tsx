"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ToolBlueprintFloorPlanPanel } from "@/components/tool-blueprint-floor-plan-panel";
import { ToolPageHeader } from "@/components/tool-page-header";
import { LinkToJobDialog } from "@/components/link-to-job-dialog";
import { ProjectBreakdownEditor } from "@/components/project-breakdown-editor";
import { createBrowserClient } from "@/lib/supabase/client";
import { floorPlanScanToElectricalRooms } from "@/lib/tool-floor-plan-scan";
import type { FloorPlanScanApiResponse } from "@/lib/tool-floor-plan-scan";
import {
  buildLoadCalculatorPayloadFromElectrical,
  buildNecCheckerPrefillQuestion,
  computeElectricalPlan,
  createElectricalRoom,
  defaultEleDedicated,
  defaultEleLowVoltage,
  type EleBuildingType,
  type EleConstructionType,
  type EleExistingService,
  type ElePermit,
  type EleServiceVoltage,
  type EleTargetService,
  type ElectricalAdditionalSystems,
  type ElectricalInputs,
  type ElectricalProjectSetup,
  type ElectricalRoomInput,
  type ElectricalResults,
} from "@/lib/electrical-analyzer-engine";
import {
  downloadElectricalFullPlanPdf,
  downloadElectricalPanelSchedulePdf,
  downloadElectricalProposalPdf,
  downloadElectricalWorkOrderPdf,
} from "@/lib/electrical-analyzer-pdf";
import {
  defaultProjectBreakdownState,
  ELECTRICAL_LABOR_PRESETS,
  ELECTRICAL_MATERIAL_PRESETS,
  grandTotals,
  seedProjectBreakdownFromElectrical,
  type ProjectBreakdownState,
} from "@/lib/project-breakdown";
import { generateWifiDocumentNumber } from "@/lib/wifi-field-documents";
import { ElectricalRoomCard } from "./electrical-analyzer-room-card";

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="border-l-4 border-[#E8C84A] pl-3 text-sm font-bold uppercase tracking-wide text-white/90">
      {children}
    </h2>
  );
}

function csvCell(v: string | number): string {
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exampleRooms(): ElectricalRoomInput[] {
  const lr = createElectricalRoom(newId(), {
    name: "Living room",
    roomType: "living_room",
    floor: 1,
    lengthFt: 18,
    widthFt: 14,
    rec15: 8,
    recessed: 6,
    dimmers: 2,
    threeWay: 2,
    afciRequired: "yes",
    lowVoltage: {
      ...defaultEleLowVoltage(),
      ethernetDrops: 2,
      speakerWire: true,
    },
  });
  const kit = createElectricalRoom(newId(), {
    name: "Kitchen",
    roomType: "kitchen",
    floor: 1,
    lengthFt: 14,
    widthFt: 12,
    rec15: 4,
    rec20: 2,
    recGfci: 4,
    recessed: 6,
    dimmers: 2,
    underCabinet: true,
    dedicated: {
      ...defaultEleDedicated(),
      refrigerator: true,
      dishwasher: true,
      microwave: true,
      disposal: true,
      rangeOven: true,
    },
    lowVoltage: { ...defaultEleLowVoltage(), ethernetDrops: 1 },
  });
  const bath = createElectricalRoom(newId(), {
    name: "Primary bathroom",
    roomType: "bathroom",
    floor: 1,
    lengthFt: 10,
    widthFt: 8,
    rec15: 2,
    recGfci: 2,
    recessed: 4,
    dimmers: 1,
    afciRequired: "no",
  });
  return [lr, kit, bath];
}

function panelColorClass(cat: string): string {
  switch (cat) {
    case "lighting":
      return "bg-sky-600/35 border-sky-400/40";
    case "receptacle":
      return "bg-emerald-600/35 border-emerald-400/40";
    case "dedicated":
      return "bg-red-600/35 border-red-400/40";
    case "hvac":
      return "bg-amber-600/40 border-amber-400/45";
    default:
      return "bg-white/10 border-white/20";
  }
}

export function ElectricalAnalyzerClient() {
  const router = useRouter();
  const sel =
    "mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white";

  const [setup, setSetup] = useState<ElectricalProjectSetup>({
    projectName: "",
    clientName: "",
    projectAddress: "",
    buildingType: "single_family",
    constructionType: "new_construction",
    totalSqFt: 2400,
    numFloors: 2,
    numUnits: 1,
    serviceVoltage: "120_240_single",
    existingService: "none_new",
    targetService: "200",
    permitRequired: "unknown",
    permitDate: "",
  });

  const [rooms, setRooms] = useState<ElectricalRoomInput[]>(exampleRooms);

  const [additional, setAdditional] = useState<ElectricalAdditionalSystems>({
    smokeDetectors: true,
    smokeCount: 4,
    smokeInterconnected: true,
    coDetectors: true,
    securitySystem: false,
    generator: false,
    genKw: 12,
    genTransfer: "manual",
    solarBatteryReady: false,
    evCharging: false,
    poolSpa: false,
    irrigation: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem("blueprint-room-scan-electrical");
    if (!raw) return;
    try {
      const j = JSON.parse(raw) as {
        rooms?: ElectricalRoomInput[];
        projectName?: string;
        totalSqFt?: number;
        numFloors?: number;
      };
      if (j.rooms?.length) setRooms(j.rooms);
      if (j.projectName) setSetup((s) => ({ ...s, projectName: j.projectName! }));
      if (typeof j.totalSqFt === "number" && j.totalSqFt > 0) {
        setSetup((s) => ({ ...s, totalSqFt: Math.round(j.totalSqFt!) }));
      }
      if (typeof j.numFloors === "number" && j.numFloors >= 1) {
        setSetup((s) => ({
          ...s,
          numFloors: Math.min(20, Math.max(1, j.numFloors!)),
        }));
      }
    } catch {
      /* ignore */
    }
    sessionStorage.removeItem("blueprint-room-scan-electrical");
  }, []);

  const [results, setResults] = useState<ElectricalResults | null>(null);
  const [pbState, setPbState] = useState<ProjectBreakdownState>(
    defaultProjectBreakdownState(),
  );
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [jobOpen, setJobOpen] = useState(false);
  const [woOpen, setWoOpen] = useState(false);
  const [propOpen, setPropOpen] = useState(false);
  const [woNo, setWoNo] = useState("");
  const [propNo, setPropNo] = useState("");
  const [linkedProjectId, setLinkedProjectId] = useState("");
  const [blueprintProjects, setBlueprintProjects] = useState<
    { id: string; project_name: string | null; file_name: string }[]
  >([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  useEffect(() => {
    let c = false;
    void (async () => {
      setProjectsLoading(true);
      try {
        const sb = createBrowserClient();
        const { data, error } = await sb
          .from("projects")
          .select("id, project_name, file_name")
          .order("created_at", { ascending: false })
          .limit(200);
        if (!c && !error && data) setBlueprintProjects(data);
      } catch {
        if (!c) setBlueprintProjects([]);
      } finally {
        if (!c) setProjectsLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  const fullInputs: ElectricalInputs = useMemo(
    () => ({
      setup,
      rooms,
      additional,
    }),
    [setup, rooms, additional],
  );

  const runCalc = useCallback(() => {
    const r = computeElectricalPlan(fullInputs);
    setResults(r);
    setPbState(seedProjectBreakdownFromElectrical(r));
  }, [fullInputs]);

  const patchSetup = (p: Partial<ElectricalProjectSetup>) =>
    setSetup((s) => ({ ...s, ...p }));

  const dupRoom = (id: string) => {
    const src = rooms.find((x) => x.id === id);
    if (!src) return;
    setRooms((p) => [...p, { ...src, id: newId(), name: `${src.name} (copy)` }]);
  };
  const rmRoom = (id: string) =>
    setRooms((p) => (p.length <= 1 ? p : p.filter((x) => x.id !== id)));
  const patchRoom = (id: string, partial: Partial<ElectricalRoomInput>) =>
    setRooms((p) => p.map((x) => (x.id === id ? { ...x, ...partial } : x)));
  const patchDedicated = (id: string, partial: Partial<ElectricalRoomInput["dedicated"]>) =>
    setRooms((p) =>
      p.map((x) =>
        x.id === id
          ? { ...x, dedicated: { ...x.dedicated, ...partial } }
          : x,
      ),
    );
  const patchLv = (id: string, partial: Partial<ElectricalRoomInput["lowVoltage"]>) =>
    setRooms((p) =>
      p.map((x) =>
        x.id === id
          ? { ...x, lowVoltage: { ...x.lowVoltage, ...partial } }
          : x,
      ),
    );

  const onApplyScan = (res: FloorPlanScanApiResponse, mode: "append" | "replace") => {
    const mapped = floorPlanScanToElectricalRooms(res.rooms, newId);
    setRooms((prev) => (mode === "replace" ? mapped : [...prev, ...mapped]));
  };

  const exportCircuitCsv = () => {
    if (!results) return;
    const lines = [
      "Circuit,Description,Room,Amps,Wire,GFCI,AFCI",
      ...results.circuitSchedule.map((r) =>
        [
          r.circuit,
          csvCell(r.description),
          csvCell(r.room),
          `${r.amps}A`,
          csvCell(r.wire),
          r.gfci ? "Yes" : "No",
          r.afci ? "Yes" : "No",
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `electrical-circuits-${(setup.projectName || "export").replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveDb = async () => {
    if (!results) {
      setSaveMsg("Run calculation first.");
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const sb = createBrowserClient();
      const row: Record<string, unknown> = {
        project_name: setup.projectName || "Untitled electrical",
        client_name: setup.clientName || "",
        building_type: setup.buildingType,
        inputs_json: fullInputs as unknown as Record<string, unknown>,
        results_json: {
          ...(results as unknown as Record<string, unknown>),
          breakdown: pbState,
        },
        circuits_json: results.circuitSchedule as unknown[],
      };
      if (linkedProjectId) row.project_id = linkedProjectId;
      const { data, error } = await sb
        .from("electrical_projects")
        .insert(row)
        .select("id")
        .single();
      if (error) throw error;
      if (data?.id) setSavedId(String(data.id));
      setSaveMsg("Saved to Supabase.");
    } catch (e) {
      setSaveMsg(
        e instanceof Error ? e.message : "Save failed (run Supabase SQL?).",
      );
    } finally {
      setSaving(false);
    }
  };

  const openLoadCalc = () => {
    try {
      const payload = buildLoadCalculatorPayloadFromElectrical(fullInputs);
      sessionStorage.setItem(
        "blueprint-load-calc-from-electrical",
        JSON.stringify(payload),
      );
    } catch {
      /* ignore */
    }
    router.push("/tools/load-calculator");
  };

  const openNecChecker = () => {
    try {
      const q = buildNecCheckerPrefillQuestion(fullInputs);
      sessionStorage.setItem(
        "blueprint-nec-checker-prefill",
        JSON.stringify({ question: q }),
      );
    } catch {
      /* ignore */
    }
    router.push("/tools/nec-checker");
  };

  const openAvAnalyzer = () => {
    const names = rooms
      .filter((r) => r.lowVoltage.speakerWire)
      .map((r) => r.name);
    try {
      sessionStorage.setItem(
        "blueprint-av-prefill-from-electrical",
        JSON.stringify({ roomNamesWithSpeaker: names, projectName: setup.projectName }),
      );
    } catch {
      /* ignore */
    }
    router.push("/tools/av-analyzer");
  };

  const g = grandTotals(pbState);

  return (
    <div className="min-h-screen bg-[#0a1628] text-white">
      <ToolPageHeader
        title="Electrical Project Analyzer"
        subtitle="Room by room electrical planning for residential and commercial projects"
      >
        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href="/dashboard"
            className="font-medium text-[#E8C84A] hover:text-[#f0d56e]"
          >
            ← Dashboard
          </Link>
          <Link href="/tools/load-calculator" className="text-white/70 hover:text-[#E8C84A]">
            Load Calculator
          </Link>
          <Link href="/tools/nec-checker" className="text-white/70 hover:text-[#E8C84A]">
            NEC Checker
          </Link>
        </div>
      </ToolPageHeader>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="space-y-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <section className="space-y-4">
            <SectionTitle>Section 1 — Project setup</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-white/70">Project name</span>
                <input
                  value={setup.projectName}
                  onChange={(e) => patchSetup({ projectName: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Client name</span>
                <input
                  value={setup.clientName}
                  onChange={(e) => patchSetup({ clientName: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-white/70">Project address</span>
                <input
                  value={setup.projectAddress}
                  onChange={(e) => patchSetup({ projectAddress: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                  placeholder="Used for NY / NEC edition hint"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-white/70">Link to blueprint project (optional)</span>
                <select
                  value={linkedProjectId}
                  onChange={(e) => setLinkedProjectId(e.target.value)}
                  className={sel}
                  disabled={projectsLoading}
                >
                  <option value="">
                    {projectsLoading ? "Loading…" : "Standalone"}
                  </option>
                  {blueprintProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {(p.project_name?.trim() ||
                        p.file_name.replace(/\.pdf$/i, "")) ?? p.id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Building type</span>
                <select
                  value={setup.buildingType}
                  onChange={(e) =>
                    patchSetup({ buildingType: e.target.value as EleBuildingType })
                  }
                  className={sel}
                >
                  <option value="single_family">Single family</option>
                  <option value="multi_family">Multi family</option>
                  <option value="commercial">Commercial</option>
                  <option value="industrial">Industrial</option>
                  <option value="retail">Retail</option>
                  <option value="restaurant">Restaurant</option>
                  <option value="office">Office</option>
                  <option value="warehouse">Warehouse</option>
                  <option value="addition">Addition</option>
                  <option value="renovation">Renovation (building)</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Construction type</span>
                <select
                  value={setup.constructionType}
                  onChange={(e) =>
                    patchSetup({
                      constructionType: e.target.value as EleConstructionType,
                    })
                  }
                  className={sel}
                >
                  <option value="new_construction">New construction</option>
                  <option value="renovation">Renovation</option>
                  <option value="addition">Addition</option>
                  <option value="service_upgrade">Service upgrade</option>
                  <option value="tenant_improvement">Tenant improvement</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Total square footage</span>
                <input
                  type="number"
                  min={0}
                  value={setup.totalSqFt}
                  onChange={(e) =>
                    patchSetup({ totalSqFt: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Number of floors</span>
                <input
                  type="number"
                  min={1}
                  value={setup.numFloors}
                  onChange={(e) =>
                    patchSetup({
                      numFloors: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Number of units (multi-family)</span>
                <input
                  type="number"
                  min={1}
                  value={setup.numUnits}
                  onChange={(e) =>
                    patchSetup({
                      numUnits: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Service voltage</span>
                <select
                  value={setup.serviceVoltage}
                  onChange={(e) =>
                    patchSetup({
                      serviceVoltage: e.target.value as EleServiceVoltage,
                    })
                  }
                  className={sel}
                >
                  <option value="120_240_single">120/240V single phase</option>
                  <option value="120_208_three">120/208V three phase</option>
                  <option value="277_480_three">277/480V three phase</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Existing service (renovation)</span>
                <select
                  value={setup.existingService}
                  onChange={(e) =>
                    patchSetup({
                      existingService: e.target.value as EleExistingService,
                    })
                  }
                  className={sel}
                >
                  <option value="none_new">None / new</option>
                  <option value="100">100A</option>
                  <option value="150">150A</option>
                  <option value="200">200A</option>
                  <option value="400">400A</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Target service size</span>
                <select
                  value={setup.targetService}
                  onChange={(e) =>
                    patchSetup({ targetService: e.target.value as EleTargetService })
                  }
                  className={sel}
                >
                  <option value="100">100A</option>
                  <option value="150">150A</option>
                  <option value="200">200A</option>
                  <option value="400">400A</option>
                  <option value="800">800A</option>
                  <option value="1200">1200A</option>
                  <option value="as_calculated">As calculated</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Permit required</span>
                <select
                  value={setup.permitRequired}
                  onChange={(e) =>
                    patchSetup({ permitRequired: e.target.value as ElePermit })
                  }
                  className={sel}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                  <option value="unknown">Unknown</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Permit date (NEC edition check)</span>
                <input
                  type="date"
                  value={setup.permitDate}
                  onChange={(e) => patchSetup({ permitDate: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                />
              </label>
            </div>
          </section>

          <ToolBlueprintFloorPlanPanel
            tool="electrical"
            title="Blueprint — upload floor plan PDF, AI room scan"
            onApplyScan={onApplyScan}
          />

          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle>Section 2 — Room by room</SectionTitle>
              <button
                type="button"
                onClick={() =>
                  setRooms((p) => [
                    ...p,
                    createElectricalRoom(newId(), { name: `Room ${p.length + 1}` }),
                  ])
                }
                className="rounded-lg border border-[#E8C84A]/50 bg-[#E8C84A]/10 px-3 py-1.5 text-sm font-medium text-[#E8C84A] hover:bg-[#E8C84A]/20"
              >
                + Add room
              </button>
            </div>
            <div className="space-y-6">
              {rooms.map((r) => (
                <ElectricalRoomCard
                  key={r.id}
                  room={r}
                  sel={sel}
                  onPatch={(p) => patchRoom(r.id, p)}
                  onDedicated={(p) => patchDedicated(r.id, p)}
                  onLowV={(p) => patchLv(r.id, p)}
                  onDup={() => dupRoom(r.id)}
                  onRemove={() => rmRoom(r.id)}
                />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <SectionTitle>Section 3 — Additional systems</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-white/85">
                <input
                  type="checkbox"
                  checked={additional.smokeDetectors}
                  onChange={(e) =>
                    setAdditional((a) => ({
                      ...a,
                      smokeDetectors: e.target.checked,
                    }))
                  }
                  className="rounded border-white/30"
                />
                Smoke detectors
              </label>
              {additional.smokeDetectors && (
                <>
                  <label className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-white/70">How many</span>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={additional.smokeCount}
                      onChange={(e) =>
                        setAdditional((a) => ({
                          ...a,
                          smokeCount: Math.max(0, Number(e.target.value) || 0),
                        }))
                      }
                      className="w-24 rounded border border-white/15 bg-[#0a1628] px-2 py-1 text-white"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-white/85 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={additional.smokeInterconnected}
                      onChange={(e) =>
                        setAdditional((a) => ({
                          ...a,
                          smokeInterconnected: e.target.checked,
                        }))
                      }
                      className="rounded border-white/30"
                    />
                    Interconnected
                  </label>
                </>
              )}
              {(
                [
                  ["coDetectors", "CO detectors"],
                  ["securitySystem", "Security system"],
                  ["generator", "Generator"],
                  ["solarBatteryReady", "Solar / battery ready"],
                  ["evCharging", "EV charging (site)"],
                  ["poolSpa", "Pool / spa (site)"],
                  ["irrigation", "Irrigation"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm text-white/85">
                  <input
                    type="checkbox"
                    checked={additional[k]}
                    onChange={(e) =>
                      setAdditional((a) => ({ ...a, [k]: e.target.checked }))
                    }
                    className="rounded border-white/30"
                  />
                  {label}
                </label>
              ))}
              {additional.generator && (
                <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="text-white/70">Generator kW</span>
                    <input
                      type="number"
                      min={1}
                      value={additional.genKw}
                      onChange={(e) =>
                        setAdditional((a) => ({
                          ...a,
                          genKw: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-white/70">Transfer</span>
                    <select
                      value={additional.genTransfer}
                      onChange={(e) =>
                        setAdditional((a) => ({
                          ...a,
                          genTransfer: e.target.value as "manual" | "auto",
                        }))
                      }
                      className={sel}
                    >
                      <option value="manual">Manual</option>
                      <option value="auto">Automatic</option>
                    </select>
                  </label>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
            <SectionTitle>Section 4 — Calculation engine</SectionTitle>
            <p className="text-sm leading-relaxed text-white/60">
              Estimates minimum general lighting circuits (sq ft ÷ 500, NEC 210.11
              style), kitchen small-appliance circuits (2 when a kitchen is listed;
              +1 with dining), one circuit per bathroom, dedicated circuits from
              your checkboxes, 25% growth on circuit count, standard panel sizes,
              and illustrative load from the same residential calculator used in the
              Load Calculator. Wire sizing: 15A → 14 AWG, 20A → 12 AWG, 30A → 10 AWG,
              50A → 6 AWG (THHN labels in schedule).
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={runCalc}
                className="rounded-lg bg-[#E8C84A] px-5 py-2.5 text-sm font-semibold text-[#0a1628] hover:bg-[#f0d56e]"
              >
                Run calculation
              </button>
              <button
                type="button"
                onClick={openLoadCalc}
                className="rounded-lg border border-sky-500/50 px-4 py-2 text-sm font-medium text-sky-100 hover:bg-sky-950/40"
              >
                Open in Load Calculator
              </button>
              <button
                type="button"
                onClick={openNecChecker}
                className="rounded-lg border border-violet-500/50 px-4 py-2 text-sm font-medium text-violet-100 hover:bg-violet-950/40"
              >
                Check NEC compliance (AI)
              </button>
              <button
                type="button"
                onClick={openAvAnalyzer}
                className="rounded-lg border border-rose-500/50 px-4 py-2 text-sm font-medium text-rose-100 hover:bg-rose-950/40"
              >
                Open AV Analyzer (speaker wire rooms)
              </button>
            </div>
          </section>

          {results && (
            <section className="space-y-8">
              <SectionTitle>Section 5 — Results</SectionTitle>

              <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                <h3 className="text-base font-semibold text-[#E8C84A]">
                  Card 1 — Project summary
                </h3>
                <ul className="mt-2 space-y-1 text-sm text-white/80">
                  <li>Total rooms: {results.summary.totalRooms}</li>
                  <li>
                    Total circuits (base estimate):{" "}
                    {results.summary.totalCircuitsEstimated}
                  </li>
                  <li>
                    With 25% growth: {results.summary.circuitsWithGrowth}
                  </li>
                  <li>
                    Recommended panel: ~{results.summary.recommendedPanelAmps}A,{" "}
                    {results.summary.recommendedPanelSpaces}-space
                  </li>
                  <li>
                    Recommended service: {results.summary.recommendedServiceAmps}A
                    (illustrative)
                  </li>
                  <li>NEC edition note: {results.necEditionLabel}</li>
                  <li>
                    Estimated wire footage:{" "}
                    {results.summary.estimatedWireFootageLf} LF (order-of-magnitude)
                  </li>
                </ul>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/25 p-4 overflow-x-auto">
                <h3 className="text-base font-semibold text-[#E8C84A]">
                  Card 2 — Circuit schedule
                </h3>
                <table className="mt-3 w-full min-w-[640px] text-left text-sm text-white/85">
                  <thead>
                    <tr className="border-b border-white/15 text-white/55">
                      <th className="py-2 pr-2">Circuit</th>
                      <th className="py-2 pr-2">Description</th>
                      <th className="py-2 pr-2">Room</th>
                      <th className="py-2 pr-2">Amps</th>
                      <th className="py-2 pr-2">Wire</th>
                      <th className="py-2 pr-2">GFCI</th>
                      <th className="py-2">AFCI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.circuitSchedule.map((r) => (
                      <tr key={r.circuit} className="border-b border-white/10">
                        <td className="py-1.5 pr-2">{r.circuit}</td>
                        <td className="py-1.5 pr-2">{r.description}</td>
                        <td className="py-1.5 pr-2">{r.room}</td>
                        <td className="py-1.5 pr-2">{r.amps}A</td>
                        <td className="py-1.5 pr-2">{r.wire}</td>
                        <td className="py-1.5 pr-2">{r.gfci ? "Yes" : "No"}</td>
                        <td className="py-1.5">{r.afci ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                <h3 className="text-base font-semibold text-[#E8C84A]">
                  Card 3 — NEC compliance (auto checklist)
                </h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {results.compliance.map((x, i) => (
                    <li
                      key={i}
                      className={
                        x.status === "pass"
                          ? "text-emerald-200"
                          : x.status === "fail"
                            ? "text-red-300"
                            : x.status === "warn"
                              ? "text-amber-200"
                              : "text-white/70"
                      }
                    >
                      {x.status === "pass"
                        ? "✅ "
                        : x.status === "fail"
                          ? "❌ "
                          : x.status === "warn"
                            ? "⚠️ "
                            : "ℹ️ "}
                      {x.text}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                <h3 className="text-base font-semibold text-[#E8C84A]">
                  Card 4 — Panel schedule (two columns)
                </h3>
                <p className="mt-1 text-xs text-white/50">
                  Blue: lighting · Green: receptacles · Red: dedicated · Orange: HVAC ·
                  Gray: spare
                </p>
                <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                  {results.panelSchedule.map((slot) => (
                    <div
                      key={slot.position}
                      className={`rounded border px-2 py-1 ${panelColorClass(slot.category)}`}
                    >
                      <span className="text-white/50">{slot.position}.</span>{" "}
                      {slot.label}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                <h3 className="text-base font-semibold text-[#E8C84A]">
                  Card 5 — Materials list
                </h3>
                <ul className="mt-2 grid gap-1 text-sm text-white/80 sm:grid-cols-2">
                  <li>14/2 NM-B: {results.materials.wire14_2NmLf} LF</li>
                  <li>12/2 NM-B: {results.materials.wire12_2NmLf} LF</li>
                  <li>10/2 NM-B: {results.materials.wire10_2NmLf} LF</li>
                  <li>6/3 NM-B: {results.materials.wire6_3NmLf} LF</li>
                  <li>14/3 NM-B (3-way): {results.materials.wire14_3NmLf} LF</li>
                  <li>15A duplex: {results.materials.duplex15} EA</li>
                  <li>20A duplex: {results.materials.duplex20} EA</li>
                  <li>GFCI (blended): {results.materials.gfci} EA</li>
                  <li>Single-pole switches: {results.materials.switchSp} EA</li>
                  <li>3-way switches: {results.materials.switch3w} EA</li>
                  <li>Dimmers: {results.materials.dimmer} EA</li>
                  <li>Recessed fixtures: {results.materials.recessed} EA</li>
                  <li>Surface fixtures: {results.materials.surfaceFixtures} EA</li>
                  <li>15A breakers: {results.materials.breaker15Sp} EA</li>
                  <li>20A breakers: {results.materials.breaker20Sp} EA</li>
                  <li>30A 2-pole: {results.materials.breaker30Dp} EA</li>
                  <li>50A+ 2-pole: {results.materials.breaker50Dp} EA</li>
                </ul>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                <h3 className="text-base font-semibold text-[#E8C84A]">
                  Card 6 — Project breakdown
                </h3>
                <p className="mt-1 text-sm text-white/55">
                  Materials tax default {pbState.salesTaxPct}% · Labor presets below.
                  Overall margin: materials + labor vs customer prices shown in editor.
                </p>
                <p className="mt-2 text-sm text-white/80">
                  Grand total (customer):{" "}
                  <span className="font-semibold text-[#E8C84A]">
                    ${g.grandCustomer.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>{" "}
                  · Profit:{" "}
                  <span className="text-emerald-200">
                    ${g.totalProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>{" "}
                  · Overall margin:{" "}
                  <span className="text-white/90">{g.overallMarginPct}%</span>
                </p>
                <div className="mt-4">
                  <ProjectBreakdownEditor
                    variant="full"
                    state={pbState}
                    onChange={setPbState}
                    projectTitle={setup.projectName || "Electrical project"}
                    materialPresetList={ELECTRICAL_MATERIAL_PRESETS}
                    laborPresetList={ELECTRICAL_LABOR_PRESETS}
                    showEquipmentColumn={false}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-white/10 pt-6">
                <button
                  type="button"
                  onClick={() => {
                    setWoNo(generateWifiDocumentNumber("WO"));
                    setWoOpen(true);
                  }}
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm hover:border-[#E8C84A]/50"
                >
                  Work order
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPropNo(generateWifiDocumentNumber("PROP"));
                    setPropOpen(true);
                  }}
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm hover:border-[#E8C84A]/50"
                >
                  Client proposal
                </button>
                <button
                  type="button"
                  onClick={() => void downloadElectricalFullPlanPdf(fullInputs, results)}
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm hover:border-[#E8C84A]/50"
                >
                  Export full plan PDF
                </button>
                <button
                  type="button"
                  onClick={exportCircuitCsv}
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm hover:border-[#E8C84A]/50"
                >
                  Export circuit CSV
                </button>
                <button
                  type="button"
                  onClick={() => void downloadElectricalPanelSchedulePdf(fullInputs, results)}
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm hover:border-[#E8C84A]/50"
                >
                  Export panel PDF
                </button>
                <button
                  type="button"
                  onClick={() => void saveDb()}
                  disabled={saving}
                  className="rounded-lg border border-emerald-500/45 px-4 py-2 text-sm text-emerald-100 hover:bg-emerald-950/35 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save to Supabase"}
                </button>
                <button
                  type="button"
                  onClick={() => setJobOpen(true)}
                  className="rounded-lg border border-[#E8C84A]/45 px-4 py-2 text-sm text-[#E8C84A] hover:bg-[#E8C84A]/10"
                >
                  Link to job
                </button>
              </div>
              {saveMsg && (
                <p className="text-sm text-white/70" role="status">
                  {saveMsg}
                  {savedId ? ` · ID ${savedId}` : ""}
                </p>
              )}
            </section>
          )}
        </div>
      </main>

      <LinkToJobDialog
        open={jobOpen}
        onOpenChange={setJobOpen}
        attachmentType="electrical_calculation"
        attachmentId={savedId}
        attachmentLabel={`Electrical: ${setup.projectName || "plan"}`}
      />

      {woOpen && results && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#0a1628] p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white">Work order PDF</h2>
            <p className="mt-1 text-xs text-white/55">
              TPP Electric letterhead · Document {woNo || "—"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  void downloadElectricalWorkOrderPdf(
                    fullInputs,
                    results,
                    woNo || generateWifiDocumentNumber("WO"),
                  )
                }
                className="rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-semibold text-[#0a1628]"
              >
                Download PDF
              </button>
              <button
                type="button"
                onClick={() => setWoOpen(false)}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {propOpen && results && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#0a1628] p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white">Client proposal PDF</h2>
            <p className="mt-1 text-xs text-white/55">
              TPP Electric branding · {propNo || "—"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  void downloadElectricalProposalPdf(
                    fullInputs,
                    results,
                    propNo || generateWifiDocumentNumber("PROP"),
                  )
                }
                className="rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-semibold text-[#0a1628]"
              >
                Download PDF
              </button>
              <button
                type="button"
                onClick={() => setPropOpen(false)}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
