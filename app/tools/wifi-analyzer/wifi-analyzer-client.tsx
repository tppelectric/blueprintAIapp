"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ToolPageHeader } from "@/components/tool-page-header";
import { LinkToJobDialog } from "@/components/link-to-job-dialog";
import { createBrowserClient } from "@/lib/supabase/client";
import { WifiHeatMapCard } from "@/components/wifi-heatmap-card";
import { WifiProjectCostCard } from "@/components/wifi-project-cost-card";
import { WifiProposalTiersCard } from "@/components/wifi-proposal-tiers-card";
import { WifiVendorComparisonModal } from "@/components/wifi-vendor-comparison-modal";
import {
  loadPdfDocumentFromArrayBuffer,
  readPdfFileAsArrayBuffer,
  WIFI_PDF_LOAD_ERROR,
} from "@/lib/wifi-blueprint-preview";
import { WIFI_PREFILL_STORAGE_KEY } from "@/lib/room-scan-tool-bridge";
import {
  computeWifiPlan,
  isMeshVendor,
  scoreRoom,
  sumCompleteRoomsTotalSqFt,
  type BudgetTier,
  type BuildingAge,
  type BuildingShape,
  type BuildingType,
  type CeilingHeight,
  type ConstructionType,
  type CoverageGoal,
  type PlanningPriority,
  type PoeChoice,
  type RoomTypeOption,
  type RoomWallMaterial,
  type StoriesCount,
  type VendorChoice,
  type WifiAnalyzerInputs,
  type WifiAnalyzerResults,
  type WifiRoomInput,
  type YesNoChoice,
} from "@/lib/wifi-analyzer-engine";
import {
  MESH_VS_ENTERPRISE_NOTE,
  WIFI_VENDOR_SELECT_OPTIONS,
} from "@/lib/wifi-vendor-catalog";
import {
  downloadWifiAnalysisPdf,
  downloadWifiClientProposalPdf,
  downloadWifiWorkOrderPdf,
} from "@/lib/wifi-analyzer-pdf";
import {
  buildClientProposalText,
  buildWorkOrderText,
  generateWifiDocumentNumber,
} from "@/lib/wifi-field-documents";
import type { ProposalTierId } from "@/lib/wifi-proposal-tiers";

const U6_PRO_TIER_OVERRIDE = {
  label: "UniFi U6 Pro ($179 ea.)",
  unit: 179,
} as const;

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Stable IDs avoid SSR/client hydration mismatches that can break interactivity. */
function exampleRooms(): WifiRoomInput[] {
  return [
    {
      id: "wifi-demo-living",
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
      id: "wifi-demo-bedroom",
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
      id: "wifi-demo-patio",
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

type BlueprintProjectOption = {
  id: string;
  project_name: string | null;
  file_name: string;
};

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

function csvCell(v: string | number): string {
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(inputs: WifiAnalyzerInputs, r: WifiAnalyzerResults): string {
  const lines: string[] = [
    "TPP Electrical Contractors Inc. — Wi-Fi takeoff export",
    `Project,${csvCell(inputs.projectName)}`,
    `Client,${csvCell(inputs.clientName || "")}`,
    `Building_type,${csvCell(inputs.buildingType)}`,
    `Total_building_sq_ft,${inputs.totalBuildingSqFt ?? ""}`,
    `Construction_type,${csvCell(inputs.constructionType)}`,
    `Building_age,${csvCell(inputs.buildingAge)}`,
    `Stories,${inputs.stories}`,
    `Basement,${csvCell(inputs.basement)}`,
    `Attic_access_cabling,${csvCell(inputs.atticAccess)}`,
    `Building_shape,${csvCell(inputs.buildingShape)}`,
    `Internet_Mbps,${inputs.internetSpeedMbps}`,
    `Planning_priority,${csvCell(inputs.planningPriority)}`,
    `Coverage_goal,${csvCell(inputs.coverageGoal)}`,
    `Vendor,${csvCell(inputs.vendor)}`,
    `Budget_tier,${csvCell(r.estimatedHardwareCostRange)}`,
    `Rooms_total,${r.totalRooms}`,
    `Rooms_complete,${r.completeRooms}`,
    `Rooms_incomplete,${r.incompleteRooms}`,
    `Building_used_sq_ft,${r.buildingUsedSqFt ?? ""}`,
    "",
    "ROOM_INPUTS",
    [
      "Room_id",
      "Name",
      "Floor",
      "Length_ft",
      "Width_ft",
      "Sq_ft_calc",
      "Room_type",
      "Wall_material",
      "Outdoor",
      "Ceiling",
      "Expected_devices",
    ].join(","),
  ];

  for (const room of inputs.rooms) {
    const sq = Math.round(
      Math.max(0, room.lengthFt) * Math.max(0, room.widthFt),
    );
    lines.push(
      [
        csvCell(room.id),
        csvCell(room.name),
        room.floor,
        room.lengthFt,
        room.widthFt,
        sq,
        csvCell(room.roomType),
        csvCell(room.wallMaterial),
        room.outdoor ? "yes" : "no",
        csvCell(room.ceilingHeight),
        room.expectedDevices,
      ].join(","),
    );
  }

  lines.push(
    "",
    "ZONE_AND_AP_ASSIGNMENT",
    [
      "Room_name",
      "Floor",
      "Area_sq_ft",
      "Complete",
      "Zone_type",
      "Served_by_AP",
      "Score",
    ].join(","),
  );
  for (const row of r.roomRows) {
    lines.push(
      [
        csvCell(row.name),
        row.floor,
        row.areaSqFt,
        row.complete ? "yes" : "no",
        csvCell(row.zoneType),
        csvCell(row.servedByAp),
        row.score,
      ].join(","),
    );
  }

  lines.push(
    "",
    "AP_PLAN",
    `Indoor_APs,${r.indoorAps}`,
    `Outdoor_APs,${r.outdoorAps}`,
    `Total_APs,${r.recommendedAps}`,
    `Whole_home_plan,${csvCell(r.equipment.wholeHomeApPlan)}`,
    `Gateway,${csvCell(r.gatewayRecommendation)}`,
    "",
    "MATERIALS",
    `CAT6_LF,${r.cat6FootageLf}`,
    `CAT6_drops,${r.cat6Drops}`,
    `LV_brackets_EA,${r.lvBrackets}`,
    `RJ45_jacks_EA,${r.rj45Jacks}`,
    `Patch_cables_EA,${r.patchCables}`,
    `PoE_switch_ports_target,${r.poeSwitchPorts}`,
    "",
    "LABOR_HOURS_ESTIMATE",
    `Cable_rough_in_h,${r.laborHours.cableRoughInHours}`,
    `AP_mount_terminate_h,${r.laborHours.apMountTerminateHours}`,
    `Switch_gateway_setup_h,${r.laborHours.switchGatewaySetupHours}`,
    `Network_config_h,${r.laborHours.networkConfigHours}`,
    `Testing_walkthrough_h,${r.laborHours.testingWalkthroughHours}`,
    `Total_labor_h,${r.laborHours.totalLaborHours}`,
    "",
    "HARDWARE_COST_ESTIMATE",
    csvCell(r.hardwareCostEstimateLabel),
  );

  return lines.join("\r\n");
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="border-l-4 border-[#E8C84A] pl-3 text-sm font-bold uppercase tracking-wide text-white/90">
      {children}
    </h2>
  );
}

function printWorkScopePlainText(text: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  const d = w.document;
  d.open();
  d.write("<!DOCTYPE html><html><head><meta charset='utf-8'><title>Work scope</title>");
  d.write(
    "<style>body{font-family:system-ui,sans-serif;white-space:pre-wrap;padding:24px;color:#111;font-size:11px;line-height:1.45;} @media print{body{padding:12px;}}</style>",
  );
  d.write("</head><body></body></html>");
  d.close();
  d.body.textContent = text;
  w.focus();
  w.print();
}

export function WifiAnalyzerClient() {
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
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
  const [savedWifiCalcId, setSavedWifiCalcId] = useState<string | null>(null);
  const [jobLinkOpen, setJobLinkOpen] = useState(false);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [workOrderOpen, setWorkOrderOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [workOrderNumber, setWorkOrderNumber] = useState("");
  const [proposalNumber, setProposalNumber] = useState("");
  const [woPdfBusy, setWoPdfBusy] = useState(false);
  const [propPdfBusy, setPropPdfBusy] = useState(false);
  const [woCopyMsg, setWoCopyMsg] = useState<string | null>(null);
  const [propCopyMsg, setPropCopyMsg] = useState<string | null>(null);

  const [blueprintProjects, setBlueprintProjects] = useState<
    BlueprintProjectOption[]
  >([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [linkedProjectId, setLinkedProjectId] = useState<string>("");

  const [totalBuildingSqFtInput, setTotalBuildingSqFtInput] = useState("");
  const [constructionType, setConstructionType] =
    useState<ConstructionType>("renovation");
  const [buildingAge, setBuildingAge] = useState<BuildingAge>("2000_2015");
  const [stories, setStories] = useState<StoriesCount>(2);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(WIFI_PREFILL_STORAGE_KEY);
      if (!raw) return;
      sessionStorage.removeItem(WIFI_PREFILL_STORAGE_KEY);
      const parsed = JSON.parse(raw) as {
        rooms?: WifiRoomInput[];
        stories?: StoriesCount;
        totalBuildingSqFt?: number;
      };
      if (Array.isArray(parsed.rooms) && parsed.rooms.length > 0) {
        setRooms(parsed.rooms);
      }
      if (
        parsed.stories === 1 ||
        parsed.stories === 2 ||
        parsed.stories === 3 ||
        parsed.stories === 4
      ) {
        setStories(parsed.stories);
      }
      if (
        typeof parsed.totalBuildingSqFt === "number" &&
        Number.isFinite(parsed.totalBuildingSqFt) &&
        parsed.totalBuildingSqFt > 0
      ) {
        setTotalBuildingSqFtInput(
          String(Math.round(parsed.totalBuildingSqFt)),
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  const [basement, setBasement] = useState<YesNoChoice>("no");
  const [atticAccess, setAtticAccess] = useState<YesNoChoice>("no");
  const [buildingShape, setBuildingShape] =
    useState<BuildingShape>("simple_rectangle");

  const [pdfArrayBuffer, setPdfArrayBuffer] = useState<ArrayBuffer | null>(
    null,
  );
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfThumbnails, setPdfThumbnails] = useState<string[]>([]);
  const [selectedPdfPage, setSelectedPdfPage] = useState(1);
  const [blueprintDataUrl, setBlueprintDataUrl] = useState<string | null>(null);
  const [pdfUploadProgress, setPdfUploadProgress] = useState(0);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [calcGeneration, setCalcGeneration] = useState(0);
  const [laborRatePerHour, setLaborRatePerHour] = useState(85);
  const [compareOpen, setCompareOpen] = useState(false);
  const [ubiquitiApOverride, setUbiquitiApOverride] = useState<{
    label: string;
    unit: number;
  } | null>(null);
  const [tierToast, setTierToast] = useState<string | null>(null);

  const resultsAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setProjectsLoading(true);
      try {
        const sb = createBrowserClient();
        const { data, error } = await sb
          .from("projects")
          .select("id, project_name, file_name")
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        if (!cancelled && data)
          setBlueprintProjects(
            data as { id: string; project_name: string | null; file_name: string }[],
          );
      } catch {
        if (!cancelled) setBlueprintProjects([]);
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pdfArrayBuffer || selectedPdfPage < 1) return;
    let cancelled = false;
    setPdfBusy(true);
    void (async () => {
      try {
        const doc = await loadPdfDocumentFromArrayBuffer(pdfArrayBuffer);
        try {
          if (cancelled) return;
          const url = await doc.renderPageToDataUrl(selectedPdfPage, 1600);
          if (!cancelled) {
            setBlueprintDataUrl(url);
            setPdfError(null);
          }
        } finally {
          doc.destroy();
        }
      } catch (e) {
        if (!cancelled) {
          setBlueprintDataUrl(null);
          const msg = e instanceof Error ? e.message : WIFI_PDF_LOAD_ERROR;
          setPdfError(
            /^Could not render page \d+$/.test(msg)
              ? msg
              : WIFI_PDF_LOAD_ERROR,
          );
        }
      } finally {
        if (!cancelled) setPdfBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfArrayBuffer, selectedPdfPage]);

  const pdfFailureMessage = (e: unknown): string => {
    const msg = e instanceof Error ? e.message : WIFI_PDF_LOAD_ERROR;
    return /^Could not render page \d+$/.test(msg)
      ? msg
      : WIFI_PDF_LOAD_ERROR;
  };

  const onPdfFile = async (file: File | undefined) => {
    if (!file) return;
    const looksPdf =
      file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!looksPdf) return;
    setPdfBusy(true);
    setPdfError(null);
    setPdfUploadProgress(5);
    let doc: Awaited<ReturnType<typeof loadPdfDocumentFromArrayBuffer>> | null =
      null;
    try {
      const buf = await readPdfFileAsArrayBuffer(file);
      setPdfArrayBuffer(buf);
      doc = await loadPdfDocumentFromArrayBuffer(buf);
      const n = doc.numPages;
      setPdfPageCount(n);
      setSelectedPdfPage(1);
      const maxThumb = Math.min(n, 12);
      const thumbs: string[] = [];
      for (let i = 1; i <= maxThumb; i++) {
        thumbs.push(await doc.renderPageToDataUrl(i, 140));
        setPdfUploadProgress(10 + Math.round((i / maxThumb) * 85));
      }
      setPdfThumbnails(thumbs);
      setPdfUploadProgress(100);
      setPdfError(null);
    } catch (e) {
      console.error(e);
      setPdfError(pdfFailureMessage(e));
      setPdfArrayBuffer(null);
      setPdfPageCount(0);
      setPdfThumbnails([]);
      setBlueprintDataUrl(null);
    } finally {
      doc?.destroy();
      setPdfBusy(false);
      window.setTimeout(() => setPdfUploadProgress(0), 700);
    }
  };

  const clearBlueprint = () => {
    setPdfArrayBuffer(null);
    setPdfPageCount(0);
    setPdfThumbnails([]);
    setBlueprintDataUrl(null);
    setSelectedPdfPage(1);
    setPdfError(null);
  };

  const calculatedSqFtFromRooms = useMemo(
    () => sumCompleteRoomsTotalSqFt(rooms),
    [rooms],
  );

  const totalBuildingSqFtParsed = useMemo(() => {
    const t = totalBuildingSqFtInput.trim();
    if (!t) return undefined;
    const n = Number(t);
    return n > 0 && Number.isFinite(n) ? Math.round(n) : undefined;
  }, [totalBuildingSqFtInput]);

  const inputs: WifiAnalyzerInputs = useMemo(
    () => ({
      projectName: projectName.trim() || "Untitled",
      clientName: clientName.trim(),
      buildingType,
      totalBuildingSqFt: totalBuildingSqFtParsed,
      constructionType,
      buildingAge,
      stories,
      basement,
      atticAccess,
      buildingShape,
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
      clientName,
      buildingType,
      totalBuildingSqFtParsed,
      constructionType,
      buildingAge,
      stories,
      basement,
      atticAccess,
      buildingShape,
      rooms,
      planningPriority,
      internetSpeedMbps,
      coverageGoal,
      poe,
      vendor,
      budget,
    ],
  );

  const workOrderText = useMemo(() => {
    if (!results || !workOrderNumber) return "";
    return buildWorkOrderText(inputs, results, workOrderNumber);
  }, [inputs, results, workOrderNumber]);

  const proposalText = useMemo(() => {
    if (!results || !proposalNumber) return "";
    return buildClientProposalText(inputs, results, proposalNumber);
  }, [inputs, results, proposalNumber]);

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

  const duplicateRoom = (id: string) => {
    setRooms((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      if (idx === -1) return prev;
      const src = prev[idx];
      const copy: WifiRoomInput = {
        ...src,
        id: newId(),
        name: `${src.name.trim()} (Copy)`,
      };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  };

  const runCalc = useCallback(() => {
    setCalcError(null);
    setSaveMsg(null);
    setCopyMsg(null);
    setCalculating(true);
    setResults(null);
    const started = Date.now();
    window.setTimeout(() => {
      try {
        const stackOpts =
          vendor === "ubiquiti" && ubiquitiApOverride
            ? { stackOpts: { ubiquitiIndoorOverride: ubiquitiApOverride } }
            : undefined;
        const next = computeWifiPlan(inputs, stackOpts);
        setResults(next);
        setCalcGeneration((g) => g + 1);
      } catch (e) {
        if (process.env.NODE_ENV === "development") console.error(e);
        setCalcError(
          e instanceof Error ? e.message : "Calculation failed. Check inputs.",
        );
      } finally {
        const elapsed = Date.now() - started;
        const pad = Math.max(0, 280 - elapsed);
        window.setTimeout(() => {
          setCalculating(false);
          window.setTimeout(() => {
            resultsAnchorRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }, 80);
        }, pad);
      }
    }, 0);
  }, [inputs, vendor, ubiquitiApOverride]);

  const selectVendorAndRecalc = useCallback(
    (v: VendorChoice) => {
      setCompareOpen(false);
      setUbiquitiApOverride(null);
      setVendor(v);
      setCalcError(null);
      setSaveMsg(null);
      try {
        const next = computeWifiPlan({ ...inputs, vendor: v });
        setResults(next);
        setCalcGeneration((g) => g + 1);
      } catch (e) {
        if (process.env.NODE_ENV === "development") console.error(e);
        setCalcError(
          e instanceof Error ? e.message : "Calculation failed. Check inputs.",
        );
      }
    },
    [inputs],
  );

  const applyProposalTier = useCallback(
    (tier: ProposalTierId) => {
      setCalcError(null);
      setSaveMsg(null);
      try {
        const tpR = computeWifiPlan(inputs, { vendorForStack: "tp_link" });
        const eeR = computeWifiPlan(inputs, { vendorForStack: "eero" });
        const accessR = computeWifiPlan(inputs, {
          vendorForStack: "access_networks",
        });
        const arakR = computeWifiPlan(inputs, { vendorForStack: "araknis" });

        if (tier === "good") {
          const goodV: VendorChoice =
            tpR.materialSubtotalMid <= eeR.materialSubtotalMid
              ? "tp_link"
              : "eero";
          setVendor(goodV);
          setUbiquitiApOverride(null);
          setResults(computeWifiPlan({ ...inputs, vendor: goodV }));
        } else if (tier === "better") {
          setVendor("ubiquiti");
          setUbiquitiApOverride({ ...U6_PRO_TIER_OVERRIDE });
          setResults(
            computeWifiPlan(
              { ...inputs, vendor: "ubiquiti" },
              {
                stackOpts: {
                  ubiquitiIndoorOverride: { ...U6_PRO_TIER_OVERRIDE },
                },
              },
            ),
          );
        } else {
          const bestV: VendorChoice =
            accessR.materialSubtotalMid <= arakR.materialSubtotalMid
              ? "access_networks"
              : "araknis";
          setVendor(bestV);
          setUbiquitiApOverride(null);
          setResults(computeWifiPlan({ ...inputs, vendor: bestV }));
        }
        setCalcGeneration((g) => g + 1);
        setTierToast("Tier updated");
        window.setTimeout(() => setTierToast(null), 2800);
      } catch (e) {
        setCalcError(
          e instanceof Error ? e.message : "Could not apply tier.",
        );
      }
    },
    [inputs],
  );

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

  const saveToProject = async () => {
    if (!results) {
      setSaveMsg("Run Calculate first.");
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const sb = createBrowserClient();
      const row: Record<string, unknown> = {
        project_name: inputs.projectName,
        building_type: buildingType,
        inputs_json: inputs as unknown as Record<string, unknown>,
        results_json: results as unknown as Record<string, unknown>,
        equipment_json: results.equipment as unknown as Record<string, unknown>,
      };
      if (linkedProjectId) {
        row.project_id = linkedProjectId;
      }
      const { data, error } = await sb
        .from("wifi_calculations")
        .insert(row)
        .select("id")
        .single();
      if (error) throw error;
      if (data?.id) setSavedWifiCalcId(String(data.id));
      setSaveMsg("Saved successfully");
    } catch (e) {
      setSaveMsg(
        e instanceof Error
          ? e.message
          : "Save failed. If needed, add project_id column (see supabase/wifi_calculations_add_project_id.sql).",
      );
    } finally {
      setSaving(false);
    }
  };

  const copyWorkOrder = async () => {
    if (!workOrderText) return;
    try {
      await navigator.clipboard.writeText(workOrderText);
      setWoCopyMsg("Copied to clipboard.");
      window.setTimeout(() => setWoCopyMsg(null), 2500);
    } catch {
      setWoCopyMsg("Could not copy.");
    }
  };

  const copyProposal = async () => {
    if (!proposalText) return;
    try {
      await navigator.clipboard.writeText(proposalText);
      setPropCopyMsg("Copied to clipboard.");
      window.setTimeout(() => setPropCopyMsg(null), 2500);
    } catch {
      setPropCopyMsg("Could not copy.");
    }
  };

  const exportWorkOrderPdf = async () => {
    if (!results || !workOrderNumber) return;
    setWoPdfBusy(true);
    try {
      await downloadWifiWorkOrderPdf(inputs, results, workOrderNumber);
    } finally {
      setWoPdfBusy(false);
    }
  };

  const exportProposalPdf = async () => {
    if (!results || !proposalNumber) return;
    setPropPdfBusy(true);
    try {
      await downloadWifiClientProposalPdf(inputs, results, proposalNumber);
    } finally {
      setPropPdfBusy(false);
    }
  };

  const openWorkOrderModal = () => {
    if (!results) return;
    setWorkOrderNumber(generateWifiDocumentNumber("WO"));
    setWoCopyMsg(null);
    setWorkOrderOpen(true);
  };

  const openProposalModal = () => {
    if (!results) return;
    setProposalNumber(generateWifiDocumentNumber("PROP"));
    setPropCopyMsg(null);
    setProposalOpen(true);
  };

  const showResults = results != null;

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
              <span className="text-white/70">Client name (for proposals)</span>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                placeholder="e.g. Jane Smith"
              />
            </label>
            <label className="block text-sm">
              <span className="text-white/70">
                Link to blueprint project (optional)
              </span>
              <select
                value={linkedProjectId}
                onChange={(e) => setLinkedProjectId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                disabled={projectsLoading}
              >
                <option value="">
                  {projectsLoading
                    ? "Loading projects…"
                    : "Standalone (not linked)"}
                </option>
                {blueprintProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {(p.project_name?.trim() ||
                      p.file_name.replace(/\.pdf$/i, "")) ?? p.id}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-white/45">
                When linked, saves attach{" "}
                <code className="text-white/60">project_id</code> for this
                blueprint. Leave unlinked for a standalone Wi‑Fi record.
              </span>
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
            <SectionTitle>Building information</SectionTitle>
            <p className="text-xs text-white/50">
              Used with the planning engine for AP count, cable estimates, and
              field notes. Total sq ft can be left blank to use the sum of
              complete rooms.
            </p>
            <label className="block text-sm">
              <span className="text-white/70">
                Total building square footage (optional)
              </span>
              <input
                type="number"
                min={1}
                step={1}
                value={totalBuildingSqFtInput}
                onChange={(e) => setTotalBuildingSqFtInput(e.target.value)}
                placeholder={
                  calculatedSqFtFromRooms > 0
                    ? `Auto from rooms: ${calculatedSqFtFromRooms} sq ft`
                    : "Enter total or complete rooms below"
                }
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white placeholder:text-white/35"
              />
            </label>
            <label className="block text-sm">
              <span className="text-white/70">Construction type</span>
              <select
                value={constructionType}
                onChange={(e) =>
                  setConstructionType(e.target.value as ConstructionType)
                }
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
              >
                <option value="new_construction">New construction</option>
                <option value="renovation">Renovation</option>
                <option value="addition">Addition</option>
                <option value="commercial_ti">Commercial tenant improvement</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-white/70">Building age (wall / RF model)</span>
              <select
                value={buildingAge}
                onChange={(e) =>
                  setBuildingAge(e.target.value as BuildingAge)
                }
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
              >
                <option value="pre_1980">Pre-1980 (plaster-era bias)</option>
                <option value="1980_2000">1980–2000</option>
                <option value="2000_2015">2000–2015</option>
                <option value="2015_plus">2015+</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-white/70">Number of stories</span>
              <select
                value={stories}
                onChange={(e) =>
                  setStories(Number(e.target.value) as StoriesCount)
                }
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4+</option>
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-white/70">Basement</span>
                <select
                  value={basement}
                  onChange={(e) =>
                    setBasement(e.target.value as YesNoChoice)
                  }
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Attic access for cabling</span>
                <select
                  value={atticAccess}
                  onChange={(e) =>
                    setAtticAccess(e.target.value as YesNoChoice)
                  }
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-white/70">Building shape</span>
              <select
                value={buildingShape}
                onChange={(e) =>
                  setBuildingShape(e.target.value as BuildingShape)
                }
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
              >
                <option value="simple_rectangle">Simple rectangle</option>
                <option value="l_shaped">L-shaped</option>
                <option value="complex">Complex</option>
                <option value="multiple_buildings">Multiple buildings</option>
              </select>
            </label>
          </section>

          <section className="space-y-4">
            <SectionTitle>Blueprint upload (optional)</SectionTitle>
            <p className="text-xs text-white/50">
              PDFs stay in your browser for heat map overlay — nothing is
              uploaded to storage.
            </p>
            {pdfError ? (
              <p className="rounded-lg border border-red-500/40 bg-red-950/35 px-3 py-2 text-sm text-red-200/95">
                {pdfError}
              </p>
            ) : null}
            <label
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#E8C84A]/40 bg-[#0a1628]/60 px-4 py-10 text-center transition hover:border-[#E8C84A]/70 hover:bg-[#0a1628]"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const f = e.dataTransfer.files?.[0];
                void onPdfFile(f);
              }}
            >
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={pdfBusy}
                onChange={(e) => void onPdfFile(e.target.files?.[0])}
              />
              <span className="text-sm font-semibold text-[#E8C84A]">
                Upload floor plan PDF for heat map overlay
              </span>
              <span className="mt-2 text-xs text-white/55">
                Drag and drop or click to select · PDF only
              </span>
            </label>
            {pdfUploadProgress > 0 && pdfUploadProgress < 100 ? (
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-[#E8C84A] transition-all duration-300"
                  style={{ width: `${pdfUploadProgress}%` }}
                />
              </div>
            ) : null}
            {pdfPageCount > 0 ? (
              <div className="rounded-lg border border-white/10 bg-[#0a1628]/50 p-4">
                <p className="text-sm text-white/85">
                  Floor plan uploaded — {pdfPageCount} page
                  {pdfPageCount === 1 ? "" : "s"} detected
                  {pdfBusy ? " (rendering…)" : ""}
                </p>
                <p className="mt-2 text-xs text-white/55">
                  Select page for heat map background
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {pdfThumbnails.map((src, idx) => {
                    const page = idx + 1;
                    return (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setSelectedPdfPage(page)}
                        className={`overflow-hidden rounded border-2 ${
                          selectedPdfPage === page
                            ? "border-[#E8C84A]"
                            : "border-transparent"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt={`Page ${page}`}
                          className="h-20 w-auto max-w-[72px] object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
                {pdfPageCount > pdfThumbnails.length ? (
                  <label className="mt-3 block text-xs text-white/60">
                    Page # (1–{pdfPageCount})
                    <input
                      type="number"
                      min={1}
                      max={pdfPageCount}
                      value={selectedPdfPage}
                      onChange={(e) =>
                        setSelectedPdfPage(
                          Math.min(
                            pdfPageCount,
                            Math.max(1, Number(e.target.value) || 1),
                          ),
                        )
                      }
                      className="ml-2 w-20 rounded border border-white/15 bg-[#0a1628] px-2 py-1 text-white"
                    />
                  </label>
                ) : null}
                <button
                  type="button"
                  onClick={clearBlueprint}
                  className="mt-3 text-xs font-medium text-red-300/90 hover:text-red-200"
                >
                  Remove PDF
                </button>
              </div>
            ) : null}
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
                      if (
                        room.roomType === "office" &&
                        room.expectedDevices >= 8
                      )
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
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => duplicateRoom(room.id)}
                          className="text-xs font-medium text-sky-300/90 hover:text-sky-200"
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() => removeRoom(room.id)}
                          className="text-xs font-medium text-red-300/90 hover:text-red-200"
                        >
                          Remove
                        </button>
                      </div>
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
              {WIFI_VENDOR_SELECT_OPTIONS.map(({ value: v, label: lab }) => (
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
                    onChange={() => {
                      setUbiquitiApOverride(null);
                      setVendor(v as VendorChoice);
                    }}
                    className="accent-[#E8C84A]"
                  />
                  {lab}
                </label>
              ))}
            </div>
            {isMeshVendor(vendor) ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-950/25 p-4 text-xs leading-relaxed whitespace-pre-wrap text-amber-100/90">
                {MESH_VS_ENTERPRISE_NOTE}
              </div>
            ) : null}
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
            disabled={calculating}
            className="w-full rounded-xl border-2 border-[#E8C84A] bg-[#E8C84A] py-3 text-center text-sm font-bold text-[#0a1628] transition-colors hover:bg-[#f0d56e] disabled:opacity-60"
          >
            {calculating ? "Calculating…" : "Calculate coverage"}
          </button>
          {calculating ? (
            <p className="text-center text-sm font-medium text-[#E8C84A]/95">
              Calculating coverage plan...
            </p>
          ) : null}
          {calcError ? (
            <p className="text-center text-sm text-red-300/95">{calcError}</p>
          ) : null}
        </div>

        {showResults && results ? (
          <div
            ref={resultsAnchorRef}
            className="mt-10 space-y-8 scroll-mt-24"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveToProject()}
                className="rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save to project"}
              </button>
              <button
                type="button"
                onClick={() => setJobLinkOpen(true)}
                className="rounded-lg border border-sky-500/45 bg-sky-500/15 px-4 py-2.5 text-sm font-semibold text-sky-100 hover:bg-sky-500/25"
              >
                Link to job
              </button>
              <button
                type="button"
                onClick={exportPdf}
                className="rounded-lg border border-[#E8C84A]/50 bg-[#E8C84A]/15 px-4 py-2.5 text-sm font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/25"
              >
                Export to PDF
              </button>
              <button
                type="button"
                onClick={exportCsv}
                className="rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
              >
                Export to CSV
              </button>
              <button
                type="button"
                onClick={openWorkOrderModal}
                className="rounded-lg border border-amber-500/45 bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-amber-100 hover:bg-amber-500/25"
              >
                Work order
              </button>
              <button
                type="button"
                onClick={openProposalModal}
                className="rounded-lg border border-violet-400/40 bg-violet-500/15 px-4 py-2.5 text-sm font-semibold text-violet-100 hover:bg-violet-500/25"
              >
                Client proposal
              </button>
              <button
                type="button"
                onClick={() => setCompareOpen(true)}
                className="rounded-lg border border-sky-400/45 bg-sky-500/15 px-4 py-2.5 text-sm font-semibold text-sky-100 hover:bg-sky-500/25"
              >
                Compare vendors
              </button>
            </div>
            {saveMsg ? (
              <p className="text-sm text-white/80">{saveMsg}</p>
            ) : null}

            <WifiHeatMapCard
              inputs={inputs}
              results={results}
              blueprintDataUrl={blueprintDataUrl}
              calcGeneration={calcGeneration}
            />

            {isMeshVendor(vendor) ? (
              <div className="rounded-xl border border-amber-500/35 bg-amber-950/20 p-4 text-xs leading-relaxed whitespace-pre-wrap text-amber-100/88">
                {MESH_VS_ENTERPRISE_NOTE}
              </div>
            ) : null}

            <WifiProposalTiersCard
              inputs={inputs}
              onSelectTier={applyProposalTier}
              toast={tierToast}
            />

            <WifiProjectCostCard
              results={results}
              calcGeneration={calcGeneration}
              laborRatePerHour={laborRatePerHour}
              onLaborRatePerHourChange={setLaborRatePerHour}
              projectName={projectName}
              wifiVendor={vendor}
            />

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
                {results.buildingUsedSqFt != null ? (
                  <li>
                    Building sq ft used for planning:{" "}
                    {results.buildingUsedSqFt}
                  </li>
                ) : null}
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
                        <span className="block text-xs text-white/55">
                          {row.servedByAp}
                        </span>
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
                AP recommendations
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

            <section className="rounded-2xl border border-orange-500/25 bg-orange-950/20 p-6">
              <h2 className="text-lg font-semibold text-orange-100">
                Labor (planning estimate)
              </h2>
              <ul className="mt-3 space-y-1.5 text-sm text-white/85">
                <li>
                  Cable rough-in: {results.laborHours.cableRoughInHours} h (
                  {results.cat6Drops} drops × 1.5 h)
                </li>
                <li>
                  AP mount &amp; terminate:{" "}
                  {results.laborHours.apMountTerminateHours} h (
                  {results.recommendedAps} APs × 0.5 h)
                </li>
                <li>
                  Switch &amp; gateway setup:{" "}
                  {results.laborHours.switchGatewaySetupHours} h
                </li>
                <li>
                  Network configuration:{" "}
                  {results.laborHours.networkConfigHours} h (1 h per 10 APs,
                  min 1)
                </li>
                <li>
                  Testing &amp; walkthrough:{" "}
                  {results.laborHours.testingWalkthroughHours} h
                </li>
                <li className="pt-2 font-semibold text-[#E8C84A]">
                  Total estimated labor: {results.laborHours.totalLaborHours}{" "}
                  hours
                </li>
              </ul>
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
                    <td className="py-2 font-medium">
                      {results.cat6FootageLf} LF
                    </td>
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
              <p className="mt-4 text-xs text-white/50">
                {results.assumptionsLine}
              </p>
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
          </div>
        ) : null}

        {workOrderOpen && results && workOrderNumber ? (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wifi-wo-title"
          >
            <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-white/15 bg-[#0a1628] shadow-xl">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <h2
                  id="wifi-wo-title"
                  className="text-base font-semibold text-white"
                >
                  Field work order — {workOrderNumber}
                </h2>
                <button
                  type="button"
                  onClick={() => setWorkOrderOpen(false)}
                  className="rounded-lg px-2 py-1 text-sm text-white/70 hover:bg-white/10 hover:text-white"
                >
                  Close
                </button>
              </div>
              <div className="max-h-[55vh] overflow-y-auto px-4 py-3">
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-white/88">
                  {workOrderText}
                </pre>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-3">
                <button
                  type="button"
                  onClick={() => void copyWorkOrder()}
                  className="rounded-lg border border-[#E8C84A]/50 bg-[#E8C84A]/15 px-3 py-2 text-sm font-semibold text-[#E8C84A]"
                >
                  Copy to clipboard
                </button>
                <button
                  type="button"
                  onClick={() => printWorkScopePlainText(workOrderText)}
                  className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold text-white"
                >
                  Print
                </button>
                <button
                  type="button"
                  disabled={woPdfBusy}
                  onClick={() => void exportWorkOrderPdf()}
                  className="rounded-lg border border-amber-500/45 bg-amber-500/15 px-3 py-2 text-sm font-semibold text-amber-100 disabled:opacity-50"
                >
                  {woPdfBusy ? "PDF…" : "Export PDF"}
                </button>
              </div>
              {woCopyMsg ? (
                <p className="px-4 pb-3 text-xs text-emerald-300/90">
                  {woCopyMsg}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {proposalOpen && results && proposalNumber ? (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wifi-prop-title"
          >
            <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-white/15 bg-[#0a1628] shadow-xl">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <h2
                  id="wifi-prop-title"
                  className="text-base font-semibold text-white"
                >
                  Client proposal — {proposalNumber}
                </h2>
                <button
                  type="button"
                  onClick={() => setProposalOpen(false)}
                  className="rounded-lg px-2 py-1 text-sm text-white/70 hover:bg-white/10 hover:text-white"
                >
                  Close
                </button>
              </div>
              <div className="max-h-[55vh] overflow-y-auto px-4 py-3">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-white/88">
                  {proposalText}
                </pre>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-3">
                <button
                  type="button"
                  onClick={() => void copyProposal()}
                  className="rounded-lg border border-[#E8C84A]/50 bg-[#E8C84A]/15 px-3 py-2 text-sm font-semibold text-[#E8C84A]"
                >
                  Copy to clipboard
                </button>
                <button
                  type="button"
                  onClick={() => printWorkScopePlainText(proposalText)}
                  className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold text-white"
                >
                  Print
                </button>
                <button
                  type="button"
                  disabled={propPdfBusy}
                  onClick={() => void exportProposalPdf()}
                  className="rounded-lg border border-violet-400/40 bg-violet-500/15 px-3 py-2 text-sm font-semibold text-violet-100 disabled:opacity-50"
                >
                  {propPdfBusy ? "PDF…" : "Export PDF"}
                </button>
              </div>
              {propCopyMsg ? (
                <p className="px-4 pb-3 text-xs text-emerald-300/90">
                  {propCopyMsg}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <WifiVendorComparisonModal
          open={compareOpen}
          onClose={() => setCompareOpen(false)}
          inputs={inputs}
          currentVendor={vendor}
          onSelectVendorAndRecalc={selectVendorAndRecalc}
        />

        <LinkToJobDialog
          open={jobLinkOpen}
          onOpenChange={setJobLinkOpen}
          attachmentType="wifi_calculation"
          attachmentId={savedWifiCalcId}
          attachmentLabel={projectName || inputs.projectName}
        />
      </main>
    </div>
  );
}
