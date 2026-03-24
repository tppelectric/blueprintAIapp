"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ToolPageHeader } from "@/components/tool-page-header";
import { LinkToJobDialog } from "@/components/link-to-job-dialog";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  computeCommercialLoad,
  computeResidentialLoad,
  type CommercialInputs,
  type CommercialOccupancy,
  type ResidentialApplianceKey,
  type ResidentialBuildingType,
  type ResidentialInputs,
} from "@/lib/load-calc-engine";
import {
  buildServiceDesign,
  type ServiceDesignInput,
} from "@/lib/load-calc-service-design";
import { downloadLoadCalcServicePackagePdf } from "@/lib/load-calc-service-package-pdf";

const DEFAULT_APPLIANCES: ResidentialInputs["appliances"] = {
  range: { enabled: false, watts: 8000 },
  dryer: { enabled: false, watts: 5000 },
  waterHeater: { enabled: false, watts: 4500 },
  dishwasher: { enabled: false, watts: 1200 },
  refrigerator: { enabled: false, watts: 150 },
  microwave: { enabled: false, watts: 1500 },
  ac: { enabled: false, tons: 3 },
  electricHeat: { enabled: false, kw: 10 },
  evL1: { enabled: false, watts: 1440 },
  evL2: { enabled: false, watts: 7200 },
  hotTub: { enabled: false, watts: 5000 },
  poolPump: { enabled: false, watts: 2000 },
  generator: { enabled: false, kw: 12 },
};

function cloneDefaultAppliances(): ResidentialInputs["appliances"] {
  return JSON.parse(
    JSON.stringify(DEFAULT_APPLIANCES),
  ) as ResidentialInputs["appliances"];
}

type ServiceAmps = "" | 100 | 150 | 200 | 400;

type SavedRow = {
  id: string;
  project_name: string;
  building_type: string;
  inputs_json: unknown;
  results_json: unknown;
  created_at: string;
};

function formatVa(n: number) {
  return `${n.toLocaleString()} VA`;
}

export function LoadCalculatorClient() {
  const [tab, setTab] = useState<"residential" | "commercial">("residential");
  const [showResults, setShowResults] = useState(true);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [sqFt, setSqFt] = useState<number | "">(2000);
  const [buildingType, setBuildingType] =
    useState<ResidentialBuildingType>("single_family");
  const [bedrooms, setBedrooms] = useState(3);
  const [bathrooms, setBathrooms] = useState(2);
  const [appliances, setAppliances] = useState(() =>
    cloneDefaultAppliances(),
  );
  const [existingService, setExistingService] = useState<ServiceAmps>(200);
  const [futureGrowthSolar, setFutureGrowthSolar] = useState(false);
  const [garageLoads, setGarageLoads] = useState(false);

  const [occ, setOcc] = useState<CommercialOccupancy>("office");
  const [cSq, setCSq] = useState<number | "">(5000);
  const [cLight, setCLight] = useState(0);
  const [cRec, setCRec] = useState(0);
  const [cEquip, setCEquip] = useState(0);
  const [cHvac, setCHvac] = useState(0);
  const [cOther, setCOther] = useState(0);

  const [saved, setSaved] = useState<SavedRow[]>([]);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [loadBusy, setLoadBusy] = useState(false);
  const [savedLoadCalcId, setSavedLoadCalcId] = useState<string | null>(null);
  const [jobLinkOpen, setJobLinkOpen] = useState(false);

  const resSquareFootage = sqFt === "" ? 0 : sqFt;
  const comSquareFootage = cSq === "" ? 0 : cSq;

  const resInput: ResidentialInputs = useMemo(
    () => ({
      projectName,
      squareFootage: resSquareFootage,
      buildingType,
      bedrooms,
      bathrooms,
      futureGrowthSolar,
      garageLoads,
      appliances,
    }),
    [
      projectName,
      resSquareFootage,
      buildingType,
      bedrooms,
      bathrooms,
      futureGrowthSolar,
      garageLoads,
      appliances,
    ],
  );

  const resResults = useMemo(() => computeResidentialLoad(resInput), [resInput]);

  const comInput: CommercialInputs = useMemo(
    () => ({
      projectName,
      occupancy: occ,
      squareFootage: comSquareFootage,
      lightingVa: cLight,
      receptacleVa: cRec,
      equipmentVa: cEquip,
      hvacVa: cHvac,
      otherVa: cOther,
    }),
    [projectName, occ, comSquareFootage, cLight, cRec, cEquip, cHvac, cOther],
  );

  const comResults = useMemo(() => computeCommercialLoad(comInput), [comInput]);

  const existingAmps =
    existingService === "" ? null : existingService;
  const verdict =
    existingAmps != null &&
    (tab === "residential"
      ? existingAmps >= resResults.recommendedServiceAmps
      : existingAmps >= comResults.recommendedServiceAmps);

  const recommended =
    tab === "residential"
      ? resResults.recommendedServiceAmps
      : comResults.recommendedServiceAmps;

  const serviceDesignInput: ServiceDesignInput = useMemo(
    () => ({
      recommendedAmps: recommended,
      tab,
      totalVa:
        tab === "residential" ? resResults.totalVa : comResults.totalVa,
      requiredAmps:
        tab === "residential"
          ? resResults.requiredAmps
          : comResults.requiredAmps,
      appliances: tab === "residential" ? appliances : undefined,
      futureGrowthSolar:
        tab === "residential" ? futureGrowthSolar : undefined,
      garageLoads: tab === "residential" ? garageLoads : undefined,
    }),
    [
      recommended,
      tab,
      resResults.totalVa,
      resResults.requiredAmps,
      comResults.totalVa,
      comResults.requiredAmps,
      appliances,
      futureGrowthSolar,
      garageLoads,
    ],
  );

  const serviceDesign = useMemo(
    () => buildServiceDesign(serviceDesignInput),
    [serviceDesignInput],
  );

  const performReset = useCallback(() => {
    setShowResults(false);
    setConfirmClearOpen(false);
    setProjectName("");
    setSqFt("");
    setBuildingType("single_family");
    setBedrooms(0);
    setBathrooms(0);
    setAppliances(cloneDefaultAppliances());
    setExistingService("");
    setOcc("office");
    setCSq("");
    setCLight(0);
    setCRec(0);
    setCEquip(0);
    setCHvac(0);
    setCOther(0);
    setFutureGrowthSolar(false);
    setGarageLoads(false);
    setSaveMsg(null);
  }, []);

  const requestReset = useCallback(() => {
    if (showResults) {
      setConfirmClearOpen(true);
    } else {
      performReset();
    }
  }, [showResults, performReset]);

  const toggleApp = (k: ResidentialApplianceKey) => {
    setAppliances((p) => ({
      ...p,
      [k]: { ...p[k], enabled: !p[k].enabled },
    }));
  };

  const patchApp = (
    k: ResidentialApplianceKey,
    patch: Partial<(typeof DEFAULT_APPLIANCES)[ResidentialApplianceKey]>,
  ) => {
    setAppliances((p) => ({ ...p, [k]: { ...p[k], ...patch } }));
  };

  const refreshSaved = useCallback(async () => {
    try {
      const sb = createBrowserClient();
      const { data, error } = await sb
        .from("load_calculations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setSaved((data ?? []) as SavedRow[]);
    } catch {
      setSaved([]);
    }
  }, []);

  const saveCalc = async (): Promise<boolean> => {
    setSaveMsg(null);
    try {
      const sb = createBrowserClient();
      const inputs =
        tab === "residential"
          ? { tab: "residential", ...resInput }
          : { tab: "commercial", ...comInput };
      const results =
        tab === "residential" ? resResults : comResults;
      const { data, error } = await sb
        .from("load_calculations")
        .insert({
          project_name: projectName.trim() || "Untitled",
          building_type: tab,
          inputs_json: inputs,
          results_json: results,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (data?.id) setSavedLoadCalcId(String(data.id));
      setSaveMsg("Saved.");
      void refreshSaved();
      return true;
    } catch (e) {
      setSaveMsg(
        e instanceof Error ? e.message : "Could not save (run Supabase SQL?).",
      );
      return false;
    }
  };

  const saveToJob = async () => {
    const ok = await saveCalc();
    if (ok) setJobLinkOpen(true);
  };

  const loadRow = (row: SavedRow) => {
    const inp = row.inputs_json as Record<string, unknown>;
    if (inp.tab === "residential") {
      setTab("residential");
      setProjectName(String(inp.projectName ?? row.project_name));
      setSqFt(
        inp.squareFootage !== undefined &&
          inp.squareFootage !== null &&
          inp.squareFootage !== ""
          ? Number(inp.squareFootage)
          : "",
      );
      setBuildingType(
        (inp.buildingType as ResidentialBuildingType) ?? "single_family",
      );
      setBedrooms(Number(inp.bedrooms) || 0);
      setBathrooms(Number(inp.bathrooms) || 0);
      if (inp.appliances && typeof inp.appliances === "object") {
        setAppliances({
          ...cloneDefaultAppliances(),
          ...(inp.appliances as ResidentialInputs["appliances"]),
        });
      }
      setFutureGrowthSolar(Boolean(inp.futureGrowthSolar));
      setGarageLoads(Boolean(inp.garageLoads));
    } else if (inp.tab === "commercial") {
      setTab("commercial");
      setProjectName(String(inp.projectName ?? row.project_name));
      setOcc((inp.occupancy as CommercialOccupancy) ?? "office");
      setCSq(
        inp.squareFootage !== undefined &&
          inp.squareFootage !== null &&
          inp.squareFootage !== ""
          ? Number(inp.squareFootage)
          : "",
      );
      setCLight(Number(inp.lightingVa) || 0);
      setCRec(Number(inp.receptacleVa) || 0);
      setCEquip(Number(inp.equipmentVa) || 0);
      setCHvac(Number(inp.hvacVa) || 0);
      setCOther(Number(inp.otherVa) || 0);
    }
    setSaveMsg("Loaded from saved.");
    setShowResults(true);
  };

  const applianceRows: {
    key: ResidentialApplianceKey;
    label: string;
    kind: "watts" | "tons" | "kw";
  }[] = [
    { key: "range", label: "Electric range/oven", kind: "watts" },
    { key: "dryer", label: "Electric dryer", kind: "watts" },
    { key: "waterHeater", label: "Electric water heater", kind: "watts" },
    { key: "dishwasher", label: "Dishwasher", kind: "watts" },
    { key: "refrigerator", label: "Refrigerator", kind: "watts" },
    { key: "microwave", label: "Microwave", kind: "watts" },
    { key: "ac", label: "AC / heat pump (tonnage)", kind: "tons" },
    { key: "electricHeat", label: "Electric heat", kind: "kw" },
    { key: "evL1", label: "EV charger Level 1", kind: "watts" },
    { key: "evL2", label: "EV charger Level 2", kind: "watts" },
    { key: "hotTub", label: "Hot tub / spa", kind: "watts" },
    { key: "poolPump", label: "Pool pump", kind: "watts" },
    { key: "generator", label: "Generator / transfer switch", kind: "kw" },
  ];

  return (
    <div className="min-h-screen bg-[#0a1628] text-white">
      <ToolPageHeader
        title="Electrical Load Calculator"
        subtitle="NEC Article 220 — 2023 Edition"
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void saveToJob()}
            className="rounded-lg border border-emerald-500/45 bg-emerald-950/35 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-950/50"
          >
            Save to job
          </button>
          <button
            type="button"
            onClick={() => setJobLinkOpen(true)}
            className="rounded-lg border border-sky-500/45 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/25"
          >
            Link to job
          </button>
          <Link
            href="/dashboard"
            className="rounded-lg border border-white/20 px-3 py-2 text-sm font-medium text-[#E8C84A] hover:bg-white/5"
          >
            ← Dashboard
          </Link>
        </div>
      </ToolPageHeader>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-1">
          <button
            type="button"
            onClick={() => setTab("residential")}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
              tab === "residential"
                ? "bg-[#E8C84A] text-[#0a1628]"
                : "text-white/65 hover:bg-white/10"
            }`}
          >
            Residential
          </button>
          <button
            type="button"
            onClick={() => setTab("commercial")}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
              tab === "commercial"
                ? "bg-[#E8C84A] text-[#0a1628]"
                : "text-white/65 hover:bg-white/10"
            }`}
          >
            Commercial
          </button>
        </div>

        {tab === "residential" ? (
          <div className="mt-8 space-y-6">
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/55">
                Dwelling inputs
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-white/70">Project name</span>
                  <input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white outline-none focus:ring-2 focus:ring-sky-500/40"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-white/70">Total square footage</span>
                  <input
                    type="number"
                    min={0}
                    value={sqFt === "" ? "" : sqFt}
                    onChange={(e) =>
                      setSqFt(
                        e.target.value === ""
                          ? ""
                          : Number(e.target.value),
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white outline-none focus:ring-2 focus:ring-sky-500/40"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-white/70">Building type</span>
                  <select
                    value={buildingType}
                    onChange={(e) =>
                      setBuildingType(e.target.value as ResidentialBuildingType)
                    }
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white outline-none focus:ring-2 focus:ring-sky-500/40"
                  >
                    <option value="single_family">Single family</option>
                    <option value="multi_family">Multi family</option>
                    <option value="condo">Condo</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-white/70">Bedrooms</span>
                  <input
                    type="number"
                    min={0}
                    value={bedrooms}
                    onChange={(e) => setBedrooms(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-white/70">Bathrooms</span>
                  <input
                    type="number"
                    min={0}
                    value={bathrooms}
                    onChange={(e) => setBathrooms(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                  />
                </label>
              </div>
              <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={futureGrowthSolar}
                    onChange={(e) => setFutureGrowthSolar(e.target.checked)}
                    className="accent-sky-500"
                  />
                  Plan for future solar / PV growth
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={garageLoads}
                    onChange={(e) => setGarageLoads(e.target.checked)}
                    className="accent-sky-500"
                  />
                  Garage / detached building loads (subpanel recommendation)
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/55">
                Appliances & equipment
              </h2>
              <ul className="mt-4 space-y-3">
                {applianceRows.map(({ key, label, kind }) => (
                  <li
                    key={key}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                  >
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={appliances[key].enabled}
                        onChange={() => toggleApp(key)}
                        className="accent-sky-500"
                      />
                      {label}
                    </label>
                    {kind === "watts" && (
                      <input
                        type="number"
                        min={0}
                        disabled={!appliances[key].enabled}
                        value={appliances[key].watts ?? 0}
                        onChange={(e) =>
                          patchApp(key, { watts: Number(e.target.value) })
                        }
                        className="w-28 rounded border border-white/15 bg-[#0a1628] px-2 py-1 text-sm disabled:opacity-40"
                      />
                    )}
                    {kind === "tons" && (
                      <span className="flex items-center gap-1 text-sm text-white/70">
                        Tons
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          disabled={!appliances[key].enabled}
                          value={appliances[key].tons ?? 0}
                          onChange={(e) =>
                            patchApp(key, { tons: Number(e.target.value) })
                          }
                          className="w-20 rounded border border-white/15 bg-[#0a1628] px-2 py-1 disabled:opacity-40"
                        />
                      </span>
                    )}
                    {kind === "kw" && (
                      <span className="flex items-center gap-1 text-sm text-white/70">
                        kW
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          disabled={!appliances[key].enabled}
                          value={appliances[key].kw ?? 0}
                          onChange={(e) =>
                            patchApp(key, { kw: Number(e.target.value) })
                          }
                          className="w-20 rounded border border-white/15 bg-[#0a1628] px-2 py-1 disabled:opacity-40"
                        />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/55">
                Commercial inputs (Part III — simplified)
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm sm:col-span-2">
                  <span className="text-white/70">Project name</span>
                  <input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                  />
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="text-white/70">Occupancy type</span>
                  <select
                    value={occ}
                    onChange={(e) =>
                      setOcc(e.target.value as CommercialOccupancy)
                    }
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                  >
                    <option value="office">Office</option>
                    <option value="retail">Retail</option>
                    <option value="restaurant">Restaurant</option>
                    <option value="warehouse">Warehouse</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-white/70">Square footage</span>
                  <input
                    type="number"
                    min={0}
                    value={cSq === "" ? "" : cSq}
                    onChange={(e) =>
                      setCSq(
                        e.target.value === ""
                          ? ""
                          : Number(e.target.value),
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-white/70">Extra lighting (VA)</span>
                  <input
                    type="number"
                    min={0}
                    value={cLight}
                    onChange={(e) => setCLight(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-white/70">Receptacle load (VA)</span>
                  <input
                    type="number"
                    min={0}
                    value={cRec}
                    onChange={(e) => setCRec(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-white/70">Equipment (VA)</span>
                  <input
                    type="number"
                    min={0}
                    value={cEquip}
                    onChange={(e) => setCEquip(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-white/70">HVAC (VA)</span>
                  <input
                    type="number"
                    min={0}
                    value={cHvac}
                    onChange={(e) => setCHvac(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-white/70">Other (VA)</span>
                  <input
                    type="number"
                    min={0}
                    value={cOther}
                    onChange={(e) => setCOther(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                  />
                </label>
              </div>
              {showResults ? (
                <p className="mt-4 text-xs text-amber-200/80">
                  {comResults.demandNote}
                </p>
              ) : null}
            </section>
          </div>
        )}

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/55">
            Existing service check
          </h2>
          <label className="mt-3 block text-sm">
            <span className="text-white/70">Existing service size (A)</span>
            <select
              value={existingService === "" ? "" : String(existingService)}
              onChange={(e) => {
                const v = e.target.value;
                setExistingService(
                  v === ""
                    ? ""
                    : (Number(v) as 100 | 150 | 200 | 400),
                );
              }}
              className="mt-1 w-full max-w-xs rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white sm:w-auto"
            >
              <option value="">— Select —</option>
              <option value={100}>100A</option>
              <option value={150}>150A</option>
              <option value={200}>200A</option>
              <option value={400}>400A</option>
            </select>
          </label>
        </section>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setShowResults(true)}
            className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
          >
            Calculate
          </button>
          <button
            type="button"
            onClick={requestReset}
            className="rounded-lg border border-white/30 bg-transparent px-4 py-2.5 text-sm font-semibold text-white/75 hover:border-white/45 hover:bg-white/[0.06] hover:text-white"
          >
            Reset calculator
          </button>
        </div>

        {showResults ? (
          <section className="mt-8 rounded-2xl border border-emerald-500/25 bg-emerald-950/20 p-6">
            <h2 className="text-lg font-semibold text-emerald-100">Results</h2>
            <dl className="mt-4 space-y-2 text-sm">
              {(tab === "residential"
                ? resResults.breakdown
                : comResults.breakdown
              ).map((row) => (
                <div key={row.label} className="flex justify-between gap-4">
                  <dt className="text-white/70">{row.label}</dt>
                  <dd className="tabular-nums text-white">
                    {formatVa(row.va)}
                  </dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t border-white/10 pt-3">
                <dt className="text-white/90">Required amperage (at 240V)</dt>
                <dd className="tabular-nums font-medium text-white">
                  {tab === "residential"
                    ? resResults.requiredAmps
                    : comResults.requiredAmps}{" "}
                  A
                </dd>
              </div>
            </dl>
            <p className="mt-6 text-2xl font-bold text-white">
              Recommended service size: {recommended}A
            </p>
            {existingAmps == null ? (
              <div className="mt-4 rounded-xl border border-white/20 bg-white/[0.06] px-4 py-3 text-sm font-medium text-white/75">
                Select an existing service size above to compare adequacy against
                the calculated recommendation.
              </div>
            ) : (
              <div
                className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${
                  verdict
                    ? "border border-emerald-500/40 bg-emerald-900/40 text-emerald-100"
                    : "border border-red-500/40 bg-red-950/50 text-red-100"
                }`}
              >
                {verdict
                  ? `${existingAmps}A Service — ADEQUATE`
                  : `${existingAmps}A Service — UNDERSIZED — ${recommended}A Required`}
              </div>
            )}

            <div className="mt-8 rounded-2xl border border-[#E8C84A]/35 bg-[#0a1628]/80 p-6">
              <h3 className="text-base font-semibold text-[#E8C84A]">
                Service entrance recommendations
              </h3>
              <p className="mt-1 text-xs text-white/50">
                Illustrative schedule — NEC Table 310.12, 250.66, Ch. 9 (conduit).
              </p>
              <div className="mt-4 space-y-4 text-sm text-white/85">
                <div>
                  <h4 className="font-semibold text-white">Service conductors</h4>
                  <ul className="mt-1 list-inside list-disc space-y-1 text-white/75">
                    <li>Phase: {serviceDesign.serviceEntrance.phaseConductors}</li>
                    <li>Neutral: {serviceDesign.serviceEntrance.neutralConductor}</li>
                    <li>
                      GEC: {serviceDesign.serviceEntrance.gec} (
                      {serviceDesign.serviceEntrance.gecNec})
                    </li>
                    <li>Conduit: {serviceDesign.serviceEntrance.conduit}</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-white">Meter socket</h4>
                  <p className="text-white/75">
                    Minimum: {serviceDesign.meterSocket.minimumRating} ·{" "}
                    {serviceDesign.meterSocket.recommended} ({serviceDesign.meterSocket.nec})
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-white">Main disconnect</h4>
                  <p className="text-white/75">
                    {serviceDesign.mainDisconnect.minimumBreaker} ·{" "}
                    {serviceDesign.mainDisconnect.recommendedPanel} (
                    {serviceDesign.mainDisconnect.nec})
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-white">Panel sizing</h4>
                  <p className="text-white/75">
                    Est. circuits: {serviceDesign.panel.estimatedCircuits} · Spaces:{" "}
                    {serviceDesign.panel.recommendedSpaces} · {serviceDesign.panel.suggestion}{" "}
                    ({serviceDesign.panel.nec})
                  </p>
                </div>
                {serviceDesign.evL1 ? (
                  <div>
                    <h4 className="font-semibold text-white">EV — Level 1</h4>
                    <ul className="list-inside list-disc text-white/75">
                      {serviceDesign.evL1.lines.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {serviceDesign.evL2 ? (
                  <div>
                    <h4 className="font-semibold text-white">EV — Level 2</h4>
                    <ul className="list-inside list-disc text-white/75">
                      {serviceDesign.evL2.lines.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {serviceDesign.subpanel ? (
                  <div>
                    <h4 className="font-semibold text-white">Subpanel</h4>
                    <p className="text-white/75">{serviceDesign.subpanel.recommended}</p>
                    <p className="text-white/75">{serviceDesign.subpanel.feederWire}</p>
                    <p className="text-white/75">
                      {serviceDesign.subpanel.feederConduit} · Breaker:{" "}
                      {serviceDesign.subpanel.feederBreaker} ({serviceDesign.subpanel.nec})
                    </p>
                  </div>
                ) : null}
                {serviceDesign.generator ? (
                  <div>
                    <h4 className="font-semibold text-white">Generator</h4>
                    <p className="text-white/75">
                      Minimum ~{serviceDesign.generator.minKw} kW · Recommended ~{" "}
                      {serviceDesign.generator.recommendedKw} kW · Transfer switch:{" "}
                      {serviceDesign.generator.transferSwitchAmps} A class (
                      {serviceDesign.generator.nec})
                    </p>
                  </div>
                ) : null}
                {serviceDesign.solarReady ? (
                  <div>
                    <h4 className="font-semibold text-white">Solar-ready</h4>
                    <ul className="list-inside list-disc text-white/75">
                      {serviceDesign.solarReady.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="text-xs text-amber-200/80">{serviceDesign.disclaimer}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  void downloadLoadCalcServicePackagePdf({
                    projectName,
                    tab,
                    inputs: serviceDesignInput,
                    results:
                      tab === "residential" ? resResults : comResults,
                    breakdown:
                      tab === "residential"
                        ? resResults.breakdown
                        : comResults.breakdown,
                  })
                }
                className="mt-4 rounded-lg border border-[#E8C84A]/50 bg-[#E8C84A]/15 px-4 py-2 text-sm font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/25"
              >
                Export service design package (PDF)
              </button>
            </div>
          </section>
        ) : (
          <p className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/55">
            Enter your inputs and click <strong className="text-white/80">Calculate</strong>{" "}
            to show load results.
          </p>
        )}

        {confirmClearOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setConfirmClearOpen(false);
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0f1f35] p-6 shadow-xl"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="clear-calc-title"
              onClick={(ev) => ev.stopPropagation()}
            >
              <h2
                id="clear-calc-title"
                className="text-lg font-semibold text-white"
              >
                Clear all values and results?
              </h2>
              <p className="mt-2 text-sm text-white/65">
                This resets every field to defaults and hides the results until
                you calculate again.
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmClearOpen(false)}
                  className="rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={performReset}
                  className="rounded-lg border border-white/25 bg-white/[0.08] px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/12"
                >
                  Yes, clear
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void saveCalc()}
            className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
          >
            Save calculation
          </button>
          <button
            type="button"
            onClick={() => {
              setLoadBusy(true);
              void refreshSaved().finally(() => setLoadBusy(false));
            }}
            className="rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/15"
          >
            {loadBusy ? "Loading…" : "Refresh saved list"}
          </button>
        </div>
        {saveMsg ? (
          <p className="mt-2 text-sm text-white/70">{saveMsg}</p>
        ) : null}

        {saved.length > 0 ? (
          <section className="mt-8 rounded-2xl border border-white/10 p-6">
            <h3 className="text-sm font-semibold text-white/80">Saved</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {saved.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                >
                  <span className="text-white/85">
                    {row.project_name}{" "}
                    <span className="text-white/45">
                      ({row.building_type}) ·{" "}
                      {new Date(row.created_at).toLocaleString()}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => loadRow(row)}
                    className="text-sky-300 hover:text-sky-200"
                  >
                    Load
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="mt-10 text-xs text-white/45">
          For estimation and education only. Verify all load calculations and
          code requirements with a licensed professional and your AHJ.
        </p>

        <LinkToJobDialog
          open={jobLinkOpen}
          onOpenChange={setJobLinkOpen}
          attachmentType="load_calculation"
          attachmentId={savedLoadCalcId}
          attachmentLabel={projectName}
        />
      </main>
    </div>
  );
}
