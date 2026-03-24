"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnalyzerProjectAssistant } from "@/components/analyzer-project-assistant";
import { ToolBlueprintFloorPlanPanel } from "@/components/tool-blueprint-floor-plan-panel";
import { ToolPageHeader } from "@/components/tool-page-header";
import { VoiceInputButton } from "@/components/voice-input-button";
import { LinkToJobDialog } from "@/components/link-to-job-dialog";
import { ProjectBreakdownEditor } from "@/components/project-breakdown-editor";
import { createBrowserClient } from "@/lib/supabase/client";
import { floorPlanScanToSmartHomeRooms } from "@/lib/tool-floor-plan-scan";
import {
  computeSmartHomePlan,
  type ShBudget,
  type ShBuildingType,
  type ShControlSystem,
  type ShInputs,
  type ShLighting,
  type ShLifestyle,
  type ShRoomInput,
  type ShRoomType,
  type ShVoice,
} from "@/lib/smarthome-analyzer-engine";
import type { ShProposalInvestment } from "@/lib/smarthome-field-documents";
import {
  defaultProjectBreakdownState,
  grandTotals,
  seedProjectBreakdownFromSmartHome,
  SMARTHOME_LABOR_PRESETS,
  SMARTHOME_MATERIAL_PRESETS,
  type ProjectBreakdownState,
} from "@/lib/project-breakdown";
import { buildProjectBreakdownCsv } from "@/lib/project-breakdown-export";
import {
  downloadSmartHomeAnalysisPdf,
  downloadSmartHomeProposalPdf,
  downloadSmartHomeWorkOrderPdf,
} from "@/lib/smarthome-analyzer-pdf";
import { generateWifiDocumentNumber } from "@/lib/wifi-field-documents";
import {
  guessShBudgetFromAnalysis,
  guessShBuildingTypeFromAnalysis,
  guessShControlSystemFromAnalysis,
} from "@/lib/analyzer-description-apply";
import {
  analysisToSmartHomeRooms,
  floorsFromAnalysis,
  totalSqFtFromAnalysis,
} from "@/lib/project-describer-prefill";

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `sh-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function exRoom(
  p: Partial<ShRoomInput> & Pick<ShRoomInput, "name">,
): ShRoomInput {
  return {
    id: newId(),
    roomType: "living_room",
    lightingControl: true,
    switchCount: 3,
    motorizedShades: false,
    shadeCount: 0,
    thermostat: true,
    avControl: true,
    doorLock: false,
    securitySensors: false,
    motionCount: 0,
    doorWindowSensorCount: 0,
    cameras: false,
    cameraIndoor: 0,
    cameraOutdoor: 0,
    voiceControl: true,
    touchscreenKeypad: false,
    occupancySensor: false,
    ...p,
  };
}

function exampleRooms(): ShRoomInput[] {
  return [
    exRoom({ name: "Living room", roomType: "living_room", switchCount: 4 }),
    exRoom({
      name: "Primary bedroom",
      roomType: "bedroom",
      switchCount: 2,
      avControl: false,
    }),
    exRoom({
      name: "Office",
      roomType: "office",
      cameras: true,
      cameraIndoor: 1,
      cameraOutdoor: 0,
      securitySensors: true,
      motionCount: 1,
      doorWindowSensorCount: 1,
    }),
  ];
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

export function SmartHomeAnalyzerClient() {
  const router = useRouter();
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [buildingType, setBuildingType] =
    useState<ShBuildingType>("new_construction");
  const [totalSqFt, setTotalSqFt] = useState(3200);
  const [floors, setFloors] = useState(2);
  const [budget, setBudget] = useState<ShBudget>("30k_75k");
  const [lifestyle, setLifestyle] = useState<ShLifestyle>("full_auto");
  const [rooms, setRooms] = useState<ShRoomInput[]>(exampleRooms);

  useEffect(() => {
    if (typeof window === "undefined") return;
    for (const key of [
      "blueprint-room-scan-smarthome",
      "blueprint-project-describer-smarthome",
    ]) {
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      try {
        const j = JSON.parse(raw) as {
          rooms?: ShRoomInput[];
          projectName?: string;
          totalSqFt?: number;
          floors?: number;
        };
        if (j.rooms?.length) setRooms(j.rooms);
        if (j.projectName) setProjectName(j.projectName);
        if (typeof j.totalSqFt === "number" && j.totalSqFt > 0) {
          setTotalSqFt(Math.round(j.totalSqFt));
        }
        if (typeof j.floors === "number" && j.floors >= 1) {
          setFloors(Math.min(6, Math.max(1, j.floors)));
        }
      } catch {
        /* ignore */
      }
      sessionStorage.removeItem(key);
      break;
    }
  }, []);

  const [controlSystem, setControlSystem] =
    useState<ShControlSystem>("no_pref");
  const [lighting, setLighting] = useState<ShLighting>("no_pref");
  const [voice, setVoice] = useState<ShVoice>("no_pref");

  const [results, setResults] = useState<ReturnType<
    typeof computeSmartHomePlan
  > | null>(null);
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

  const inputs: ShInputs = useMemo(
    () => ({
      projectName,
      clientName,
      buildingType,
      totalSqFt,
      floors,
      budget,
      lifestyle,
      rooms,
      controlSystem,
      lighting,
      voice,
    }),
    [
      projectName,
      clientName,
      buildingType,
      totalSqFt,
      floors,
      budget,
      lifestyle,
      rooms,
      controlSystem,
      lighting,
      voice,
    ],
  );

  const pbInvestment = useMemo((): ShProposalInvestment | null => {
    if (pbState.materials.length === 0 && pbState.labor.length === 0) {
      return null;
    }
    const g = grandTotals(pbState);
    return {
      materialsAfterMarkup: g.materialsCustomerAfterMarkup,
      salesTax: g.materialsTaxAmount,
      materialsWithTax: g.materialsWithTaxCustomer,
      laborNoTax: g.laborCustomerPrice,
      total: g.grandCustomer,
      taxPct: pbState.salesTaxPct,
    };
  }, [pbState]);

  const runCalc = useCallback(() => {
    const r = computeSmartHomePlan(inputs);
    setResults(r);
    setPbState(seedProjectBreakdownFromSmartHome(r));
  }, [inputs]);

  const dupRoom = (id: string) => {
    const src = rooms.find((x) => x.id === id);
    if (!src) return;
    setRooms((p) => [...p, { ...src, id: newId(), name: `${src.name} (copy)` }]);
  };
  const rmRoom = (id: string) =>
    setRooms((p) => (p.length <= 1 ? p : p.filter((x) => x.id !== id)));
  const patch = (id: string, partial: Partial<ShRoomInput>) =>
    setRooms((p) => p.map((x) => (x.id === id ? { ...x, ...partial } : x)));

  const exportDeviceCsv = () => {
    if (!results) return;
    const lines = [
      "TPP Electrical — Smart Home device export",
      `Project,${csvCell(projectName)}`,
      "",
      "Room,Dimmers,Shades,Thermostat,Keypad,Cameras,Lock,Sensors",
    ];
    for (const row of results.roomRows) {
      lines.push(
        [
          csvCell(row.roomName),
          row.dimmers,
          row.shades,
          csvCell(row.thermostat),
          csvCell(row.keypad),
          row.camera,
          csvCell(row.lock),
          row.sensors,
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smarthome-devices-${(projectName || "export").replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveDb = async () => {
    if (!results) {
      setSaveMsg("Calculate first.");
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const sb = createBrowserClient();
      const row: Record<string, unknown> = {
        project_name: projectName || "Untitled smart home",
        building_type: buildingType,
        inputs_json: inputs as unknown as Record<string, unknown>,
        results_json: {
          ...(results as unknown as Record<string, unknown>),
          breakdown: pbState,
        },
      };
      if (linkedProjectId) row.project_id = linkedProjectId;
      const { data, error } = await sb
        .from("smarthome_calculations")
        .insert(row)
        .select("id")
        .single();
      if (error) throw error;
      if (data?.id) setSavedId(String(data.id));
      setSaveMsg("Saved successfully.");
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const openWifi = () => {
    if (!results) return;
    try {
      sessionStorage.setItem(
        "blueprint-wifi-prefill-from-smarthome",
        JSON.stringify({ rooms: results.wifiDeviceHint }),
      );
    } catch {
      /* ignore */
    }
    router.push("/tools/wifi-analyzer");
  };

  const sel =
    "mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white";

  return (
    <div className="min-h-screen bg-[#0a1628] text-white">
      <ToolPageHeader
        title="Smart Home and Automation System Planner"
        subtitle="Control system design for residential and commercial automation"
      >
        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href="/dashboard"
            className="font-medium text-[#E8C84A] hover:text-[#f0d56e]"
          >
            ← Dashboard
          </Link>
          <Link href="/tools/wifi-analyzer" className="text-white/70 hover:text-[#E8C84A]">
            Wi‑Fi Analyzer
          </Link>
          <Link href="/tools/av-analyzer" className="text-white/70 hover:text-[#E8C84A]">
            AV Analyzer
          </Link>
        </div>
      </ToolPageHeader>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="space-y-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <AnalyzerProjectAssistant
            hints={["smarthome"]}
            roomSectionId="smarthome-analyzer-room-list"
            onApply={(a) => {
              setRooms(analysisToSmartHomeRooms(a, newId));
              setTotalSqFt(totalSqFtFromAnalysis(a));
              setFloors(
                Math.min(6, Math.max(1, floorsFromAnalysis(a))),
              );
              setBuildingType(guessShBuildingTypeFromAnalysis(a));
              setBudget(guessShBudgetFromAnalysis(a));
              setControlSystem(guessShControlSystemFromAnalysis(a));
            }}
          />
          <section className="space-y-4">
            <SectionTitle>Project setup</SectionTitle>
            <label className="block text-sm">
              <span className="text-white/70">Project name</span>
              <div className="mt-1 flex items-end gap-2">
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                />
                <VoiceInputButton
                  onAppend
                  placeholder="Voice"
                  onTranscript={(t) =>
                    setProjectName((prev) => prev + t)
                  }
                />
              </div>
            </label>
            <label className="block text-sm">
              <span className="text-white/70">Client name</span>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
              />
            </label>
            <label className="block text-sm">
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
                value={buildingType}
                onChange={(e) =>
                  setBuildingType(e.target.value as ShBuildingType)
                }
                className={sel}
              >
                <option value="new_construction">New construction</option>
                <option value="renovation">Renovation</option>
                <option value="retrofit">Retrofit</option>
                <option value="commercial">Commercial</option>
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-white/70">Total square footage</span>
                <input
                  type="number"
                  min={0}
                  value={totalSqFt}
                  onChange={(e) => setTotalSqFt(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Floors</span>
                <input
                  type="number"
                  min={1}
                  value={floors}
                  onChange={(e) =>
                    setFloors(Math.max(1, Number(e.target.value) || 1))
                  }
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-white/70">Budget</span>
              <select
                value={budget}
                onChange={(e) => setBudget(e.target.value as ShBudget)}
                className={sel}
              >
                <option value="under_10k">Under $10,000</option>
                <option value="10k_30k">$10,000 – $30,000</option>
                <option value="30k_75k">$30,000 – $75,000</option>
                <option value="75k_200k">$75,000 – $200,000</option>
                <option value="200k_plus">$200,000+</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-white/70">Lifestyle priority</span>
              <select
                value={lifestyle}
                onChange={(e) => setLifestyle(e.target.value as ShLifestyle)}
                className={sel}
              >
                <option value="convenience">Convenience</option>
                <option value="energy">Energy savings</option>
                <option value="security">Security</option>
                <option value="entertainment">Entertainment</option>
                <option value="full_auto">Full automation</option>
                <option value="commercial_control">Commercial control</option>
              </select>
            </label>
          </section>

          <ToolBlueprintFloorPlanPanel
            tool="smarthome"
            onApplyScan={(res, mode) => {
              const mapped = floorPlanScanToSmartHomeRooms(res.rooms, newId);
              if (mode === "replace") setRooms(mapped);
              else setRooms((prev) => [...prev, ...mapped]);
            }}
          />

          <section
            id="smarthome-analyzer-room-list"
            className="space-y-4 scroll-mt-4"
          >
            <SectionTitle>Room by room devices</SectionTitle>
            <div className="space-y-6">
              {rooms.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-[#E8C84A]/20 bg-[#071422]/80 p-4"
                >
                  <div className="mb-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => dupRoom(r.id)}
                      className="rounded border border-white/20 px-2 py-1 text-xs text-[#E8C84A]"
                    >
                      Duplicate room
                    </button>
                    <button
                      type="button"
                      onClick={() => rmRoom(r.id)}
                      className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm sm:col-span-2">
                      <span className="text-white/60">Room name</span>
                      <input
                        value={r.name}
                        onChange={(e) => patch(r.id, { name: e.target.value })}
                        className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-1.5 text-white"
                      />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <span className="text-white/60">Room type</span>
                      <select
                        value={r.roomType}
                        onChange={(e) =>
                          patch(r.id, { roomType: e.target.value as ShRoomType })
                        }
                        className={sel}
                      >
                        <option value="living_room">Living room</option>
                        <option value="bedroom">Bedroom</option>
                        <option value="kitchen">Kitchen</option>
                        <option value="office">Office</option>
                        <option value="hallway">Hallway</option>
                        <option value="basement">Basement</option>
                        <option value="garage">Garage</option>
                        <option value="outdoor">Outdoor</option>
                        <option value="conference">Conference</option>
                        <option value="lobby">Lobby</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={r.lightingControl}
                        onChange={(e) =>
                          patch(r.id, { lightingControl: e.target.checked })
                        }
                      />
                      Lighting control
                    </label>
                    {r.lightingControl ? (
                      <label className="text-sm">
                        <span className="text-white/60">Switches / dimmers</span>
                        <input
                          type="number"
                          min={1}
                          value={r.switchCount}
                          onChange={(e) =>
                            patch(r.id, {
                              switchCount: Math.max(
                                1,
                                Number(e.target.value) || 1,
                              ),
                            })
                          }
                          className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-1.5 text-white"
                        />
                      </label>
                    ) : null}
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={r.motorizedShades}
                        onChange={(e) =>
                          patch(r.id, { motorizedShades: e.target.checked })
                        }
                      />
                      Motorized shades
                    </label>
                    {r.motorizedShades ? (
                      <label className="text-sm">
                        <span className="text-white/60">Number of shades</span>
                        <input
                          type="number"
                          min={1}
                          value={r.shadeCount}
                          onChange={(e) =>
                            patch(r.id, {
                              shadeCount: Math.max(
                                1,
                                Number(e.target.value) || 1,
                              ),
                            })
                          }
                          className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-1.5 text-white"
                        />
                      </label>
                    ) : null}
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={r.thermostat}
                        onChange={(e) =>
                          patch(r.id, { thermostat: e.target.checked })
                        }
                      />
                      Thermostat
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={r.avControl}
                        onChange={(e) => patch(r.id, { avControl: e.target.checked })}
                      />
                      AV control needed
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={r.doorLock}
                        onChange={(e) => patch(r.id, { doorLock: e.target.checked })}
                      />
                      Door lock
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={r.securitySensors}
                        onChange={(e) =>
                          patch(r.id, { securitySensors: e.target.checked })
                        }
                      />
                      Security sensors
                    </label>
                    {r.securitySensors ? (
                      <>
                        <label className="text-sm">
                          <span className="text-white/60">Motion count</span>
                          <input
                            type="number"
                            min={0}
                            value={r.motionCount}
                            onChange={(e) =>
                              patch(r.id, {
                                motionCount: Math.max(
                                  0,
                                  Number(e.target.value) || 0,
                                ),
                              })
                            }
                            className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-1.5 text-white"
                          />
                        </label>
                        <label className="text-sm">
                          <span className="text-white/60">Door/window sensors</span>
                          <input
                            type="number"
                            min={0}
                            value={r.doorWindowSensorCount}
                            onChange={(e) =>
                              patch(r.id, {
                                doorWindowSensorCount: Math.max(
                                  0,
                                  Number(e.target.value) || 0,
                                ),
                              })
                            }
                            className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-1.5 text-white"
                          />
                        </label>
                      </>
                    ) : null}
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={r.cameras}
                        onChange={(e) => patch(r.id, { cameras: e.target.checked })}
                      />
                      Cameras
                    </label>
                    {r.cameras ? (
                      <>
                        <label className="text-sm">
                          <span className="text-white/60">Indoor cameras</span>
                          <input
                            type="number"
                            min={0}
                            value={r.cameraIndoor}
                            onChange={(e) =>
                              patch(r.id, {
                                cameraIndoor: Math.max(
                                  0,
                                  Number(e.target.value) || 0,
                                ),
                              })
                            }
                            className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-1.5 text-white"
                          />
                        </label>
                        <label className="text-sm">
                          <span className="text-white/60">Outdoor cameras</span>
                          <input
                            type="number"
                            min={0}
                            value={r.cameraOutdoor}
                            onChange={(e) =>
                              patch(r.id, {
                                cameraOutdoor: Math.max(
                                  0,
                                  Number(e.target.value) || 0,
                                ),
                              })
                            }
                            className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-1.5 text-white"
                          />
                        </label>
                      </>
                    ) : null}
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={r.voiceControl}
                        onChange={(e) =>
                          patch(r.id, { voiceControl: e.target.checked })
                        }
                      />
                      Voice control
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={r.touchscreenKeypad}
                        onChange={(e) =>
                          patch(r.id, { touchscreenKeypad: e.target.checked })
                        }
                      />
                      Touchscreen or keypad
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={r.occupancySensor}
                        onChange={(e) =>
                          patch(r.id, { occupancySensor: e.target.checked })
                        }
                      />
                      Occupancy sensor
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setRooms((p) => [...p, exRoom({ name: `Room ${p.length + 1}` })])
              }
              className="rounded-lg border border-[#E8C84A]/45 bg-[#E8C84A]/10 px-3 py-2 text-sm font-semibold text-[#E8C84A]"
            >
              + Add room
            </button>
          </section>

          <section className="space-y-4">
            <SectionTitle>System preferences</SectionTitle>
            <label className="block text-sm">
              <span className="text-white/70">Control system</span>
              <select
                value={controlSystem}
                onChange={(e) =>
                  setControlSystem(e.target.value as ShControlSystem)
                }
                className={sel}
              >
                <option value="no_pref">No preference (recommend best fit)</option>
                <option value="homekit">Apple HomeKit</option>
                <option value="google">Google Home</option>
                <option value="alexa">Amazon Alexa</option>
                <option value="home_assistant">Home Assistant</option>
                <option value="control4">Control4</option>
                <option value="josh">Josh.ai</option>
                <option value="urc">URC</option>
                <option value="savant">Savant</option>
                <option value="crestron">Crestron</option>
                <option value="lutron_homeworks">Lutron HomeWorks QSX</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-white/70">Lighting control</span>
              <select
                value={lighting}
                onChange={(e) => setLighting(e.target.value as ShLighting)}
                className={sel}
              >
                <option value="no_pref">No preference</option>
                <option value="lutron_ra3">Lutron RadioRA 3</option>
                <option value="lutron_homeworks">Lutron HomeWorks QSX</option>
                <option value="lutron_caseta">Lutron Caseta</option>
                <option value="leviton">Leviton Decora Smart</option>
                <option value="c4_lighting">Control4 Lighting</option>
                <option value="savant_lighting">Savant Lighting</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-white/70">Voice assistant</span>
              <select
                value={voice}
                onChange={(e) => setVoice(e.target.value as ShVoice)}
                className={sel}
              >
                <option value="no_pref">No preference</option>
                <option value="josh">Josh.ai</option>
                <option value="alexa">Amazon Alexa</option>
                <option value="google">Google Assistant</option>
                <option value="siri">Apple Siri / HomeKit</option>
                <option value="c4_voice">Control4 voice</option>
              </select>
            </label>
          </section>

          <button
            type="button"
            onClick={runCalc}
            className="rounded-lg bg-[#E8C84A] px-5 py-2.5 text-sm font-bold text-[#0a1628]"
          >
            Calculate plan
          </button>

          {results ? (
            <>
              <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
                <SectionTitle>System summary</SectionTitle>
                <ul className="mt-2 space-y-1 text-sm text-white/85">
                  <li>Lighting control points: {results.summary.lightingPoints}</li>
                  <li>Motorized shades: {results.summary.shades}</li>
                  <li>Thermostats: {results.summary.thermostats}</li>
                  <li>Cameras: {results.summary.cameras}</li>
                  <li>Door locks: {results.summary.locks}</li>
                  <li>Security sensors: {results.summary.securitySensors}</li>
                  <li>Keypads / touchscreens: {results.summary.keypads}</li>
                  <li>Total controlled devices: {results.summary.totalDevices}</li>
                </ul>
              </section>

              <section className="space-y-2 rounded-xl border border-white/10 p-5">
                <SectionTitle>Recommended control system</SectionTitle>
                <p className="text-sm font-semibold text-white">
                  {results.controller.title}
                </p>
                <p className="text-sm text-white/75">{results.controller.why}</p>
                <p className="text-sm text-white/80">
                  {results.controller.model} × {results.controller.qty}
                </p>
                <p className="text-sm text-white/70">
                  Programming estimate: {results.controller.programmingHours} hrs
                </p>
                <p className="text-sm text-white/60">
                  {results.controller.networkNotes}
                </p>
                <p className="text-sm text-white/60">
                  {results.controller.integrationNotes}
                </p>
              </section>

              <section className="space-y-3">
                <SectionTitle>Good / better / best</SectionTitle>
                <div className="overflow-x-auto rounded-lg border border-white/10">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-[#E8C84A]/15 text-[10px] font-bold uppercase text-[#E8C84A]">
                      <tr>
                        <th className="px-2 py-2">Tier</th>
                        <th className="px-2 py-2">Control</th>
                        <th className="px-2 py-2">Lighting</th>
                        <th className="px-2 py-2">Voice</th>
                        <th className="px-2 py-2">Hardware $</th>
                        <th className="px-2 py-2">Prog. hrs</th>
                        <th className="px-2 py-2">Best for</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.tiers.map((t) => (
                        <tr
                          key={t.tier}
                          className="border-t border-white/10 odd:bg-white/[0.02]"
                        >
                          <td className="px-2 py-2 font-medium capitalize">
                            {t.tier}
                          </td>
                          <td className="px-2 py-2 text-white/80">{t.control}</td>
                          <td className="px-2 py-2 text-white/80">{t.lighting}</td>
                          <td className="px-2 py-2 text-white/80">{t.voice}</td>
                          <td className="px-2 py-2 text-[#E8C84A]">
                            {t.hardwareCostRange}
                          </td>
                          <td className="px-2 py-2">{t.programmingHours}</td>
                          <td className="px-2 py-2 text-xs text-white/65">
                            {t.suitedFor}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="space-y-2">
                <SectionTitle>Device list by room</SectionTitle>
                <div className="overflow-x-auto rounded-lg border border-white/10">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-[#E8C84A]/15 text-[10px] font-bold uppercase text-[#E8C84A]">
                      <tr>
                        <th className="px-2 py-2">Room</th>
                        <th className="px-2 py-2">Dimmers</th>
                        <th className="px-2 py-2">Shades</th>
                        <th className="px-2 py-2">T-stat</th>
                        <th className="px-2 py-2">Keypad</th>
                        <th className="px-2 py-2">Cam</th>
                        <th className="px-2 py-2">Lock</th>
                        <th className="px-2 py-2">Sensors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.roomRows.map((row) => (
                        <tr
                          key={row.roomId}
                          className="border-t border-white/10 odd:bg-white/[0.02]"
                        >
                          <td className="px-2 py-2">{row.roomName}</td>
                          <td className="px-2 py-2">{row.dimmers}</td>
                          <td className="px-2 py-2">{row.shades}</td>
                          <td className="px-2 py-2">{row.thermostat}</td>
                          <td className="px-2 py-2">{row.keypad}</td>
                          <td className="px-2 py-2">{row.camera}</td>
                          <td className="px-2 py-2">{row.lock}</td>
                          <td className="px-2 py-2">{row.sensors}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="space-y-2">
                <SectionTitle>Wiring requirements</SectionTitle>
                <ul className="list-inside list-disc text-sm text-white/80">
                  {results.wiringBullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </section>

              <section className="space-y-2 rounded-xl border border-cyan-500/25 bg-cyan-950/20 p-5">
                <SectionTitle>Network requirements</SectionTitle>
                <ul className="text-sm text-white/85">
                  <li>IP cameras: {results.network.ipCameras}</li>
                  <li>IP controllers (est.): {results.network.ipControllers}</li>
                  <li>Recommended switch size: ~{results.network.recommendedSwitchPorts} ports</li>
                  <li className="mt-2 font-semibold text-cyan-200/90">VLANs</li>
                  {results.network.vlanNotes.map((v) => (
                    <li key={v} className="ml-4 list-disc text-white/70">
                      {v}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={openWifi}
                  className="mt-3 rounded-lg border border-cyan-400/50 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-100"
                >
                  Open in Wi‑Fi Analyzer
                </button>
              </section>

              <section className="space-y-4">
                <SectionTitle>Project breakdown</SectionTitle>
                <ProjectBreakdownEditor
                  key="sh-pb"
                  variant="full"
                  state={pbState}
                  onChange={setPbState}
                  projectTitle={projectName || "Smart home project"}
                  materialPresetList={SMARTHOME_MATERIAL_PRESETS}
                  laborPresetList={SMARTHOME_LABOR_PRESETS}
                  showEquipmentColumn={false}
                />
              </section>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void downloadSmartHomeAnalysisPdf(inputs, results)}
                  className="rounded-lg border border-[#E8C84A]/50 px-3 py-2 text-sm text-[#E8C84A]"
                >
                  Export full plan PDF
                </button>
                <button
                  type="button"
                  onClick={exportDeviceCsv}
                  className="rounded-lg border border-white/25 px-3 py-2 text-sm"
                >
                  Export device list CSV
                </button>
                <button
                  type="button"
                  onClick={() => void saveDb()}
                  disabled={saving}
                  className="rounded-lg border border-emerald-500/50 px-3 py-2 text-sm text-emerald-200"
                >
                  {saving ? "Saving…" : "Save to database"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWoNo(generateWifiDocumentNumber("WO"));
                    setWoOpen(true);
                  }}
                  className="rounded-lg border border-sky-500/50 px-3 py-2 text-sm text-sky-200"
                >
                  Work order
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPropNo(generateWifiDocumentNumber("PROP"));
                    setPropOpen(true);
                  }}
                  className="rounded-lg border border-violet-500/50 px-3 py-2 text-sm text-violet-200"
                >
                  Client proposal
                </button>
                <button
                  type="button"
                  onClick={() => setJobOpen(true)}
                  className="rounded-lg border border-amber-500/50 px-3 py-2 text-sm text-amber-200"
                >
                  Link to job
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const csv = buildProjectBreakdownCsv(
                      pbState,
                      projectName || "Smart home",
                    );
                    const blob = new Blob([csv], {
                      type: "text/csv;charset=utf-8",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `smarthome-breakdown-${(projectName || "export").replace(/\s+/g, "-")}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="rounded-lg border border-white/20 px-3 py-2 text-sm"
                >
                  Export breakdown CSV
                </button>
              </div>
              {saveMsg ? (
                <p className="text-sm text-white/70">{saveMsg}</p>
              ) : null}
            </>
          ) : null}
        </div>
      </main>

      <LinkToJobDialog
        open={jobOpen}
        onOpenChange={setJobOpen}
        attachmentType="smarthome_calculation"
        attachmentId={savedId}
        attachmentLabel={projectName || "Smart home calculation"}
      />

      {woOpen && results ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#0a1628] p-6">
            <h3 className="text-lg font-semibold text-[#E8C84A]">Work order</h3>
            <p className="mt-2 text-xs text-white/60">{woNo}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  void downloadSmartHomeWorkOrderPdf(inputs, results, woNo)
                }
                className="rounded bg-[#E8C84A] px-3 py-2 text-sm font-semibold text-[#0a1628]"
              >
                Download PDF
              </button>
              <button
                type="button"
                onClick={() => setWoOpen(false)}
                className="text-sm text-white/60"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {propOpen && results ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#0a1628] p-6">
            <h3 className="text-lg font-semibold text-[#E8C84A]">
              Client proposal
            </h3>
            <p className="mt-2 text-xs text-white/60">{propNo}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  void downloadSmartHomeProposalPdf(
                    inputs,
                    results,
                    propNo,
                    pbInvestment,
                  )
                }
                className="rounded bg-[#E8C84A] px-3 py-2 text-sm font-semibold text-[#0a1628]"
              >
                Download PDF
              </button>
              <button
                type="button"
                onClick={() => setPropOpen(false)}
                className="text-sm text-white/60"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
