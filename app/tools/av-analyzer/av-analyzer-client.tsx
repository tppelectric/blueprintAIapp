"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ToolPageHeader } from "@/components/tool-page-header";
import { LinkToJobDialog } from "@/components/link-to-job-dialog";
import { ProjectBreakdownEditor } from "@/components/project-breakdown-editor";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  computeAvPlan,
  type AvAmbientLight,
  type AvAudioBrand,
  type AvAvInputs,
  type AvBudgetTier,
  type AvBuildingType,
  type AvCeilingHeight,
  type AvCeilingType,
  type AvDisplayPref,
  type AvDistribution,
  type AvPrimaryFocus,
  type AvPrimaryUse,
  type AvAcousticTreatment,
  type AvRoomInput,
  type AvRoomType,
  type AvVideoBrand,
} from "@/lib/av-analyzer-engine";
import type { AvProposalInvestment } from "@/lib/av-field-documents";
import {
  AV_LABOR_PRESETS,
  AV_MATERIAL_PRESETS,
  defaultProjectBreakdownState,
  grandTotals,
  seedProjectBreakdownFromAv,
  type ProjectBreakdownState,
} from "@/lib/project-breakdown";
import { buildProjectBreakdownCsv } from "@/lib/project-breakdown-export";
import {
  downloadAvAnalysisPdf,
  downloadAvProposalPdf,
  downloadAvWorkOrderPdf,
} from "@/lib/av-analyzer-pdf";
import { generateWifiDocumentNumber } from "@/lib/wifi-field-documents";

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `av-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function exRoom(p: Partial<AvRoomInput> & Pick<AvRoomInput, "name">): AvRoomInput {
  return {
    id: newId(),
    floor: 1,
    lengthFt: 16,
    widthFt: 14,
    roomType: "living_room",
    primaryUse: "multi_purpose",
    ceilingType: "standard_flat",
    ceilingHeight: "9",
    acousticTreatment: "some_soft",
    seats: 4,
    displayNeeded: true,
    displayPref: "no_pref",
    ambientLight: "moderate",
    ...p,
  };
}

function exampleRooms(): AvRoomInput[] {
  return [
    exRoom({ name: "Living room", roomType: "living_room", floor: 1 }),
    exRoom({
      name: "Primary bedroom",
      roomType: "master_bedroom",
      floor: 2,
      displayNeeded: false,
    }),
    exRoom({
      name: "Patio",
      roomType: "patio",
      floor: 1,
      lengthFt: 14,
      widthFt: 10,
      displayNeeded: false,
      ambientLight: "outdoor",
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

export function AvAnalyzerClient() {
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [buildingType, setBuildingType] =
    useState<AvBuildingType>("residential");
  const [totalSqFt, setTotalSqFt] = useState(2800);
  const [floors, setFloors] = useState(2);
  const [budget, setBudget] = useState<AvBudgetTier>("15k_50k");
  const [primaryFocus, setPrimaryFocus] =
    useState<AvPrimaryFocus>("both_av");
  const [rooms, setRooms] = useState<AvRoomInput[]>(exampleRooms);
  const [audioBrand, setAudioBrand] = useState<AvAudioBrand>("no_pref");
  const [videoBrand, setVideoBrand] = useState<AvVideoBrand>("no_pref");
  const [distribution, setDistribution] =
    useState<AvDistribution>("no_pref");

  const [results, setResults] = useState<ReturnType<
    typeof computeAvPlan
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

  const pbInvestment = useMemo((): AvProposalInvestment | null => {
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

  const inputs: AvAvInputs = useMemo(
    () => ({
      projectName,
      clientName,
      buildingType,
      totalSqFt,
      floors,
      budget,
      primaryFocus,
      rooms,
      audioBrand,
      videoBrand,
      distribution,
    }),
    [
      projectName,
      clientName,
      buildingType,
      totalSqFt,
      floors,
      budget,
      primaryFocus,
      rooms,
      audioBrand,
      videoBrand,
      distribution,
    ],
  );

  const runCalc = useCallback(() => {
    const r = computeAvPlan(inputs);
    setResults(r);
    setPbState(seedProjectBreakdownFromAv(r));
  }, [inputs]);

  const dupRoom = (id: string) => {
    const src = rooms.find((x) => x.id === id);
    if (!src) return;
    setRooms((prev) => [...prev, { ...src, id: newId(), name: `${src.name} (copy)` }]);
  };
  const rmRoom = (id: string) =>
    setRooms((prev) => (prev.length <= 1 ? prev : prev.filter((x) => x.id !== id)));

  const patchRoom = (id: string, p: Partial<AvRoomInput>) =>
    setRooms((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const buildCsv = () => {
    if (!results) return "";
    const lines: string[] = [
      "TPP Electrical — AV Analyzer export",
      `Project,${csvCell(projectName)}`,
      `Client,${csvCell(clientName)}`,
      "",
      "ROOM,Floor,SqFt,Speakers,Display_in,Zone,Spk_wire,Video_wire",
    ];
    for (const row of results.roomRows) {
      lines.push(
        [
          csvCell(row.roomName),
          row.floor,
          row.sqFt,
          row.speakerQty,
          row.displaySizeIn ?? "",
          csvCell(row.zone),
          csvCell(row.speakerWireNote),
          csvCell(row.videoWireNote),
        ].join(","),
      );
    }
    lines.push("", "MATERIALS_ROLLUP");
    const m = results.materials;
    lines.push(`Speakers_525,${m.speakers525}`);
    lines.push(`Speakers_65,${m.speakers65}`);
    lines.push(`Speakers_8,${m.speakers8}`);
    lines.push(`HDMI_LF,${m.hdmiLf}`);
    lines.push(`Cat6_LF,${m.cat6Lf}`);
    return lines.join("\r\n");
  };

  const exportCsv = () => {
    if (!results) return;
    const blob = new Blob([buildCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `av-takeoff-${(projectName || "export").replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveDb = async () => {
    if (!results) {
      setSaveMsg("Run Calculate first.");
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const sb = createBrowserClient();
      const row: Record<string, unknown> = {
        project_name: projectName || "Untitled AV",
        building_type: buildingType,
        inputs_json: inputs as unknown as Record<string, unknown>,
        results_json: {
          ...(results as unknown as Record<string, unknown>),
          breakdown: pbState,
        },
      };
      if (linkedProjectId) row.project_id = linkedProjectId;
      const { data, error } = await sb
        .from("av_calculations")
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

  const sel =
    "mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white";

  return (
    <div className="min-h-screen bg-[#0a1628] text-white">
      <ToolPageHeader
        title="Audio/Video System Analyzer & Planner"
        subtitle="Professional AV design for residential and commercial installations"
      >
        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href="/dashboard"
            className="font-medium text-[#E8C84A] hover:text-[#f0d56e]"
          >
            ← Dashboard
          </Link>
          <Link
            href="/tools/wifi-analyzer"
            className="text-white/70 hover:text-[#E8C84A]"
          >
            Wi‑Fi Analyzer
          </Link>
          <Link
            href="/tools/smarthome-analyzer"
            className="text-white/70 hover:text-[#E8C84A]"
          >
            Smart Home Analyzer
          </Link>
        </div>
      </ToolPageHeader>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="space-y-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <section className="space-y-4">
            <SectionTitle>Project setup</SectionTitle>
            <label className="block text-sm">
              <span className="text-white/70">Project name</span>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
              />
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
                  setBuildingType(e.target.value as AvBuildingType)
                }
                className={sel}
              >
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="restaurant">Restaurant</option>
                <option value="retail">Retail</option>
                <option value="house_of_worship">House of Worship</option>
                <option value="education">Education</option>
                <option value="hospitality">Hospitality</option>
                <option value="other">Other</option>
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
                <span className="text-white/70">Number of floors</span>
                <input
                  type="number"
                  min={1}
                  value={floors}
                  onChange={(e) => setFloors(Math.max(1, Number(e.target.value) || 1))}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-white/70">Project budget</span>
              <select
                value={budget}
                onChange={(e) => setBudget(e.target.value as AvBudgetTier)}
                className={sel}
              >
                <option value="under_5k">Under $5,000</option>
                <option value="5k_15k">$5,000 – $15,000</option>
                <option value="15k_50k">$15,000 – $50,000</option>
                <option value="50k_150k">$50,000 – $150,000</option>
                <option value="150k_plus">$150,000+</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-white/70">Primary focus</span>
              <select
                value={primaryFocus}
                onChange={(e) =>
                  setPrimaryFocus(e.target.value as AvPrimaryFocus)
                }
                className={sel}
              >
                <option value="distributed_audio">Distributed audio</option>
                <option value="home_theater">Home theater</option>
                <option value="both_av">Both audio and video</option>
                <option value="commercial_av">Commercial AV</option>
                <option value="outdoor_entertainment">Outdoor entertainment</option>
              </select>
            </label>
          </section>

          <section className="space-y-4">
            <SectionTitle>Room by room</SectionTitle>
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
                    <label className="text-sm">
                      <span className="text-white/60">Room name</span>
                      <input
                        value={r.name}
                        onChange={(e) => patchRoom(r.id, { name: e.target.value })}
                        className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-1.5 text-white"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="text-white/60">Floor</span>
                      <input
                        type="number"
                        value={r.floor}
                        onChange={(e) =>
                          patchRoom(r.id, { floor: Number(e.target.value) || 1 })
                        }
                        className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-1.5 text-white"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="text-white/60">Length (ft)</span>
                      <input
                        type="number"
                        value={r.lengthFt}
                        onChange={(e) =>
                          patchRoom(r.id, {
                            lengthFt: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-1.5 text-white"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="text-white/60">Width (ft)</span>
                      <input
                        type="number"
                        value={r.widthFt}
                        onChange={(e) =>
                          patchRoom(r.id, {
                            widthFt: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-1.5 text-white"
                      />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <span className="text-white/60">Room type</span>
                      <select
                        value={r.roomType}
                        onChange={(e) =>
                          patchRoom(r.id, { roomType: e.target.value as AvRoomType })
                        }
                        className={sel}
                      >
                        <option value="living_room">Living Room</option>
                        <option value="master_bedroom">Master Bedroom</option>
                        <option value="bedroom">Bedroom</option>
                        <option value="kitchen">Kitchen</option>
                        <option value="dining_room">Dining Room</option>
                        <option value="office">Office</option>
                        <option value="home_theater">Home Theater</option>
                        <option value="media_room">Media Room</option>
                        <option value="basement">Basement</option>
                        <option value="patio">Patio</option>
                        <option value="pool_area">Pool Area</option>
                        <option value="outdoor">Outdoor</option>
                        <option value="conference_room">Conference Room</option>
                        <option value="boardroom">Boardroom</option>
                        <option value="restaurant">Restaurant</option>
                        <option value="bar">Bar</option>
                        <option value="lobby">Lobby</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <span className="text-white/60">Primary use</span>
                      <select
                        value={r.primaryUse}
                        onChange={(e) =>
                          patchRoom(r.id, {
                            primaryUse: e.target.value as AvPrimaryUse,
                          })
                        }
                        className={sel}
                      >
                        <option value="background_music">Background music only</option>
                        <option value="critical_listening">Critical listening</option>
                        <option value="home_theater_use">Home theater</option>
                        <option value="video_conferencing">Video conferencing</option>
                        <option value="commercial_music">Commercial music</option>
                        <option value="outdoor_entertainment_use">
                          Outdoor entertainment
                        </option>
                        <option value="multi_purpose">Multi-purpose</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className="text-white/60">Ceiling type</span>
                      <select
                        value={r.ceilingType}
                        onChange={(e) =>
                          patchRoom(r.id, {
                            ceilingType: e.target.value as AvCeilingType,
                          })
                        }
                        className={sel}
                      >
                        <option value="standard_flat">Standard flat</option>
                        <option value="vaulted">Vaulted</option>
                        <option value="cathedral">Cathedral</option>
                        <option value="coffered">Coffered</option>
                        <option value="exposed_beam">Exposed beam</option>
                        <option value="drop_ceiling">Drop ceiling</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className="text-white/60">Ceiling height</span>
                      <select
                        value={r.ceilingHeight}
                        onChange={(e) =>
                          patchRoom(r.id, {
                            ceilingHeight: e.target.value as AvCeilingHeight,
                          })
                        }
                        className={sel}
                      >
                        <option value="8">8&apos;</option>
                        <option value="9">9&apos;</option>
                        <option value="10">10&apos;</option>
                        <option value="12">12&apos;</option>
                        <option value="14">14&apos;</option>
                        <option value="higher">Higher</option>
                      </select>
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <span className="text-white/60">Acoustic treatment</span>
                      <select
                        value={r.acousticTreatment}
                        onChange={(e) =>
                          patchRoom(r.id, {
                            acousticTreatment: e.target.value as AvAcousticTreatment,
                          })
                        }
                        className={sel}
                      >
                        <option value="none">None</option>
                        <option value="some_soft">Some soft furnishings</option>
                        <option value="treated">Treated room</option>
                        <option value="dedicated_theater">Dedicated theater</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className="text-white/60">Seats / viewing positions</span>
                      <input
                        type="number"
                        min={1}
                        value={r.seats}
                        onChange={(e) =>
                          patchRoom(r.id, {
                            seats: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-1.5 text-white"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={r.displayNeeded}
                        onChange={(e) =>
                          patchRoom(r.id, { displayNeeded: e.target.checked })
                        }
                      />
                      Display needed
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <span className="text-white/60">Projector / TV preference</span>
                      <select
                        value={r.displayPref}
                        onChange={(e) =>
                          patchRoom(r.id, {
                            displayPref: e.target.value as AvDisplayPref,
                          })
                        }
                        className={sel}
                      >
                        <option value="no_pref">No preference</option>
                        <option value="tv_preferred">TV preferred</option>
                        <option value="projector_preferred">Projector preferred</option>
                      </select>
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <span className="text-white/60">Ambient light</span>
                      <select
                        value={r.ambientLight}
                        onChange={(e) =>
                          patchRoom(r.id, {
                            ambientLight: e.target.value as AvAmbientLight,
                          })
                        }
                        className={sel}
                      >
                        <option value="very_dark">Very dark</option>
                        <option value="dark">Dark</option>
                        <option value="moderate">Moderate</option>
                        <option value="bright">Bright</option>
                        <option value="very_bright">Very bright</option>
                        <option value="outdoor">Outdoor</option>
                      </select>
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setRooms((p) => [
                  ...p,
                  exRoom({ name: `Room ${p.length + 1}` }),
                ])
              }
              className="rounded-lg border border-[#E8C84A]/45 bg-[#E8C84A]/10 px-3 py-2 text-sm font-semibold text-[#E8C84A]"
            >
              + Add room
            </button>
          </section>

          <section className="space-y-4">
            <SectionTitle>System preferences</SectionTitle>
            <label className="block text-sm">
              <span className="text-white/70">Preferred audio brand</span>
              <select
                value={audioBrand}
                onChange={(e) =>
                  setAudioBrand(e.target.value as AvAudioBrand)
                }
                className={sel}
              >
                <option value="no_pref">No preference</option>
                <option value="sonos">Sonos (easy / app-based)</option>
                <option value="sonance">Sonance (architectural)</option>
                <option value="origin">Origin Acoustics (premium architectural)</option>
                <option value="james">James Loudspeaker (ultra premium)</option>
                <option value="klipsch">Klipsch (performance value)</option>
                <option value="polk">Polk Audio (budget)</option>
                <option value="triad">Triad (custom)</option>
                <option value="leon">Leon Speakers (custom / design)</option>
                <option value="qsc">QSC (commercial)</option>
                <option value="bose_commercial">Bose (commercial)</option>
                <option value="jbl_commercial">JBL Commercial</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-white/70">Preferred video brand</span>
              <select
                value={videoBrand}
                onChange={(e) =>
                  setVideoBrand(e.target.value as AvVideoBrand)
                }
                className={sel}
              >
                <option value="no_pref">No preference</option>
                <option value="samsung">Samsung</option>
                <option value="lg">LG</option>
                <option value="sony_tv">Sony</option>
                <option value="epson">Epson (projector)</option>
                <option value="benq">BenQ (projector)</option>
                <option value="sony_proj">Sony (projector)</option>
                <option value="jvc">JVC (projector)</option>
                <option value="lg_oled">LG OLED</option>
                <option value="samsung_qd_oled">Samsung QD-OLED</option>
                <option value="sony_oled">Sony OLED</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-white/70">Distribution system</span>
              <select
                value={distribution}
                onChange={(e) =>
                  setDistribution(e.target.value as AvDistribution)
                }
                className={sel}
              >
                <option value="no_pref">No preference</option>
                <option value="sonos">Sonos ecosystem</option>
                <option value="control4">Control4 integrated</option>
                <option value="savant">Savant integrated</option>
                <option value="avr_standalone">Standalone AV receiver</option>
                <option value="commercial_distributed">Commercial distributed</option>
              </select>
            </label>
          </section>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={runCalc}
              className="rounded-lg bg-[#E8C84A] px-5 py-2.5 text-sm font-bold text-[#0a1628]"
            >
              Calculate plan
            </button>
          </div>

          {results ? (
            <>
              <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-5">
                <SectionTitle>Results — system summary</SectionTitle>
                <ul className="space-y-1 text-sm text-white/85">
                  <li>Rooms with audio: {results.roomsWithAudio}</li>
                  <li>Rooms with video: {results.roomsWithVideo}</li>
                  <li>Total speakers: {results.totalSpeakers}</li>
                  <li>Total displays: {results.totalDisplays}</li>
                  <li>Amplifier zones: {results.ampZones}</li>
                  <li>Distribution: {results.recommendedDistribution}</li>
                  <li>{results.amplificationNote}</li>
                </ul>
              </section>

              <section className="space-y-4">
                <SectionTitle>Good / better / best</SectionTitle>
                <div className="grid gap-4 md:grid-cols-3">
                  {results.tiers.map((t) => (
                    <div
                      key={t.id}
                      className={`rounded-xl border p-4 ${t.popular ? "border-[#E8C84A] bg-[#E8C84A]/10" : "border-white/15 bg-white/[0.03]"}`}
                    >
                      {t.popular ? (
                        <p className="mb-2 text-xs font-bold uppercase text-[#E8C84A]">
                          Most popular
                        </p>
                      ) : null}
                      <h3 className="font-semibold text-white">{t.label}</h3>
                      <p className="mt-2 text-xs text-white/70">{t.speakersNote}</p>
                      <p className="mt-1 text-xs text-white/70">{t.displaysNote}</p>
                      <p className="mt-1 text-xs text-white/70">{t.distributionNote}</p>
                      <p className="mt-1 text-xs text-white/70">{t.ampNote}</p>
                      <p className="mt-3 text-sm font-semibold text-[#E8C84A]">
                        {t.costRange}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <SectionTitle>Room plan</SectionTitle>
                <div className="overflow-x-auto rounded-lg border border-white/10">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-[#E8C84A]/15 text-[10px] font-bold uppercase text-[#E8C84A]">
                      <tr>
                        <th className="px-2 py-2">Room</th>
                        <th className="px-2 py-2">Speakers</th>
                        <th className="px-2 py-2">Display</th>
                        <th className="px-2 py-2">Wire</th>
                        <th className="px-2 py-2">Zone</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.roomRows.map((row) => (
                        <tr
                          key={row.roomId}
                          className="border-t border-white/10 odd:bg-white/[0.02]"
                        >
                          <td className="px-2 py-2">{row.roomName}</td>
                          <td className="px-2 py-2">
                            {row.speakerQty} · {row.speakerSizeNote}
                          </td>
                          <td className="px-2 py-2">
                            {row.displaySizeIn
                              ? `${row.displaySizeIn}" — ${row.displayTypeNote}`
                              : "—"}
                          </td>
                          <td className="px-2 py-2 text-xs text-white/70">
                            {row.speakerWireNote}; {row.videoWireNote}
                          </td>
                          <td className="px-2 py-2">{row.zone}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="space-y-2">
                <SectionTitle>Materials & wiring list</SectionTitle>
                <ul className="list-inside list-disc text-sm text-white/80">
                  <li>
                    In-ceiling 5.25&quot; / 6.5&quot; / 8&quot;:{" "}
                    {results.materials.speakers525} / {results.materials.speakers65} /{" "}
                    {results.materials.speakers8}
                  </li>
                  <li>Outdoor pairs: {results.materials.outdoorPairs}</li>
                  <li>
                    Speaker wire LF — 16/2: {results.materials.speakerWire16Lf}, 14/2:{" "}
                    {results.materials.speakerWire14Lf}, 12/2:{" "}
                    {results.materials.speakerWire12Lf}
                  </li>
                  <li>HDMI: {results.materials.hdmiLf} LF · Cat6: {results.materials.cat6Lf} LF</li>
                  <li>HDBaseT kits: {results.materials.hdbasetKits}</li>
                  <li>LV brackets: {results.materials.lvBrackets}</li>
                  <li>Volume controls: {results.materials.volumeControls}</li>
                </ul>
              </section>

              <section className="space-y-4">
                <SectionTitle>Project breakdown</SectionTitle>
                <ProjectBreakdownEditor
                  key="av-pb"
                  variant="full"
                  state={pbState}
                  onChange={setPbState}
                  projectTitle={projectName || "AV project"}
                  materialPresetList={AV_MATERIAL_PRESETS}
                  laborPresetList={AV_LABOR_PRESETS}
                  showEquipmentColumn={false}
                />
              </section>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void downloadAvAnalysisPdf(inputs, results)}
                  className="rounded-lg border border-[#E8C84A]/50 px-3 py-2 text-sm text-[#E8C84A]"
                >
                  Export plan PDF
                </button>
                <button
                  type="button"
                  onClick={exportCsv}
                  className="rounded-lg border border-white/25 px-3 py-2 text-sm"
                >
                  Export materials CSV
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
                      projectName || "AV",
                    );
                    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `av-breakdown-${(projectName || "export").replace(/\s+/g, "-")}.csv`;
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
        attachmentType="av_calculation"
        attachmentId={savedId}
        attachmentLabel={projectName || "AV calculation"}
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
                  void downloadAvWorkOrderPdf(inputs, results, woNo)
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
            <h3 className="text-lg font-semibold text-[#E8C84A]">Client proposal</h3>
            <p className="mt-2 text-xs text-white/60">{propNo}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  void downloadAvProposalPdf(
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
