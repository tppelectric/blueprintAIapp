"use client";

import type { Project, ProjectJob } from "@package/types";
import { useEffect, useState } from "react";
import { AppShell } from "../../../components/app-shell";

const DEFAULT_FORM = {
  projectClass: "single_dwelling",
  electricalSystem: "single_120_240",
  squareFeet: 2800,
  smallApplianceCircuits: 2,
  laundryCircuits: 1,
  dryers: 1,
  rangeVa: 12000,
  waterHeaterVa: 4500,
  dishwasherVa: 1200,
  disposalVa: 800,
  microwaveVa: 1500,
  hvacCoolingVa: 4500,
  hvacHeatingVa: 8000,
  poolPumpVa: 0,
  poolHeaterVa: 0,
  evChargers: 0,
  evChargerVa: 7680,
  otherContinuousLoadsVa: 0,
  otherNonContinuousLoadsVa: 0,
  largestMotorVa: 1800,
  additionalLoadsVa: 0
};

const DEFAULT_EASY_FORM = {
  projectClass: "single_dwelling",
  electricalSystem: "single_120_240",
  squareFeet: 2800,
  smallApplianceCircuits: 2,
  laundryCircuits: 1,
  dryers: 1,
  hasRange: true,
  hasWaterHeater: true,
  hasDishwasher: true,
  hasDisposal: true,
  hasMicrowave: true,
  hvacType: "electric_heat",
  hvacSizeVa: 8000,
  poolPumpVa: 0,
  poolHeaterVa: 0,
  evChargers: 0,
  evChargerVa: 7680,
  additionalLoadsVa: 0
};

type EntryUnit = "va" | "watts" | "amps";
type ElectricalSystemValue = "single_120_240" | "single_120_208" | "three_120_208" | "three_277_480";
type AdvancedPowerField =
  | "rangeVa"
  | "waterHeaterVa"
  | "dishwasherVa"
  | "disposalVa"
  | "microwaveVa"
  | "hvacCoolingVa"
  | "hvacHeatingVa"
  | "poolPumpVa"
  | "poolHeaterVa"
  | "evChargerVa"
  | "otherContinuousLoadsVa"
  | "otherNonContinuousLoadsVa"
  | "largestMotorVa"
  | "additionalLoadsVa";
type EasyPowerField = "hvacSizeVa" | "poolPumpVa" | "poolHeaterVa" | "evChargerVa" | "additionalLoadsVa";

const DEFAULT_ADVANCED_UNITS: Record<AdvancedPowerField, EntryUnit> = {
  rangeVa: "va",
  waterHeaterVa: "va",
  dishwasherVa: "va",
  disposalVa: "va",
  microwaveVa: "va",
  hvacCoolingVa: "va",
  hvacHeatingVa: "va",
  poolPumpVa: "va",
  poolHeaterVa: "va",
  evChargerVa: "va",
  otherContinuousLoadsVa: "va",
  otherNonContinuousLoadsVa: "va",
  largestMotorVa: "va",
  additionalLoadsVa: "va"
};

const DEFAULT_EASY_UNITS: Record<EasyPowerField, EntryUnit> = {
  hvacSizeVa: "va",
  poolPumpVa: "va",
  poolHeaterVa: "va",
  evChargerVa: "va",
  additionalLoadsVa: "va"
};

type LoadResult = {
  lightingLoadVa: number;
  generalLoadVa: number;
  demandAdjustedGeneralLoadVa: number;
  smallApplianceLoadVa: number;
  laundryLoadVa: number;
  dryerLoadVa: number;
  rangeLoadVa: number;
  waterHeaterLoadVa: number;
  dishwasherLoadVa: number;
  disposalLoadVa: number;
  microwaveLoadVa: number;
  hvacNonCoincidentLoadVa: number;
  poolPumpLoadVa: number;
  poolHeaterLoadVa: number;
  evLoadVa: number;
  adjustedEvLoadVa: number;
  otherContinuousLoadsVa: number;
  adjustedOtherContinuousLoadsVa: number;
  otherNonContinuousLoadsVa: number;
  largestMotorAdderVa: number;
  totalVa: number;
  serviceVoltage: number;
  calculatedAmps: number;
  recommendedServiceSize: string;
  assumptions?: string[];
};

export default function LoadCalculatorPage() {
  const [mode, setMode] = useState<"easy" | "advanced">("easy");
  const [form, setForm] = useState(DEFAULT_FORM);
  const [easyForm, setEasyForm] = useState(DEFAULT_EASY_FORM);
  const [advancedPowerUnits, setAdvancedPowerUnits] = useState(DEFAULT_ADVANCED_UNITS);
  const [easyPowerUnits, setEasyPowerUnits] = useState(DEFAULT_EASY_UNITS);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [status, setStatus] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [jobs, setJobs] = useState<ProjectJob[]>([]);
  const [assignProjectId, setAssignProjectId] = useState("");
  const [assignJobId, setAssignJobId] = useState("");
  const [assignStatus, setAssignStatus] = useState("");

  function getSystemInfo(system: ElectricalSystemValue): { voltageLl: number; threePhase: boolean } {
    if (system === "single_120_208") {
      return { voltageLl: 208, threePhase: false };
    }
    if (system === "three_120_208") {
      return { voltageLl: 208, threePhase: true };
    }
    if (system === "three_277_480") {
      return { voltageLl: 480, threePhase: true };
    }
    return { voltageLl: 240, threePhase: false };
  }

  function convertEntryToVa(
    value: number,
    unit: EntryUnit,
    electricalSystem: ElectricalSystemValue
  ): number {
    if (unit === "va" || unit === "watts") {
      return Number.isFinite(value) ? value : 0;
    }
    const { voltageLl, threePhase } = getSystemInfo(electricalSystem);
    const va = threePhase ? value * 1.732 * voltageLl : value * voltageLl;
    return Number(va.toFixed(2));
  }

  function convertVaToEntry(
    valueVa: number,
    unit: EntryUnit,
    electricalSystem: ElectricalSystemValue
  ): number {
    if (unit === "va" || unit === "watts") {
      return valueVa;
    }
    const { voltageLl, threePhase } = getSystemInfo(electricalSystem);
    const amps = threePhase ? valueVa / (1.732 * voltageLl) : valueVa / voltageLl;
    return Number(amps.toFixed(2));
  }

  function unitLabel(unit: EntryUnit): string {
    if (unit === "amps") {
      return "Amps";
    }
    if (unit === "watts") {
      return "Watts";
    }
    return "VA";
  }

  function renderUnitSelect(
    currentUnit: EntryUnit,
    onChange: (nextUnit: EntryUnit) => void
  ) {
    return (
      <select value={currentUnit} onChange={(event) => onChange(event.target.value as EntryUnit)}>
        <option value="va">VA</option>
        <option value="watts">Watts</option>
        <option value="amps">Amps</option>
      </select>
    );
  }

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const payload = (await response.json()) as { projects?: Project[] };
      const loadedProjects = payload.projects ?? [];
      setProjects(loadedProjects);
      if (loadedProjects.length > 0) {
        setAssignProjectId(loadedProjects[0].id);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      if (!assignProjectId) {
        setJobs([]);
        setAssignJobId("");
        return;
      }
      const response = await fetch(`/api/projects/${assignProjectId}/jobs`, { cache: "no-store" });
      const payload = (await response.json()) as { jobs?: ProjectJob[] };
      setJobs(payload.jobs ?? []);
      setAssignJobId("");
    })();
  }, [assignProjectId]);

  function buildPayloadFromEasyForm() {
    const hasRange = easyForm.hasRange ? 12000 : 0;
    const hasWaterHeater = easyForm.hasWaterHeater ? 4500 : 0;
    const hasDishwasher = easyForm.hasDishwasher ? 1200 : 0;
    const hasDisposal = easyForm.hasDisposal ? 800 : 0;
    const hasMicrowave = easyForm.hasMicrowave ? 1500 : 0;

    let hvacCoolingVa = 0;
    let hvacHeatingVa = 0;
    if (easyForm.hvacType === "ac_only") {
      hvacCoolingVa = easyForm.hvacSizeVa;
    } else if (easyForm.hvacType === "heat_pump") {
      hvacCoolingVa = easyForm.hvacSizeVa;
      hvacHeatingVa = easyForm.hvacSizeVa;
    } else if (easyForm.hvacType === "electric_heat") {
      hvacHeatingVa = easyForm.hvacSizeVa;
    }

    return {
      ...DEFAULT_FORM,
      projectClass: easyForm.projectClass,
      electricalSystem: easyForm.electricalSystem,
      squareFeet: easyForm.squareFeet,
      smallApplianceCircuits: easyForm.smallApplianceCircuits,
      laundryCircuits: easyForm.laundryCircuits,
      dryers: easyForm.dryers,
      rangeVa: hasRange,
      waterHeaterVa: hasWaterHeater,
      dishwasherVa: hasDishwasher,
      disposalVa: hasDisposal,
      microwaveVa: hasMicrowave,
      hvacCoolingVa,
      hvacHeatingVa,
      poolPumpVa: easyForm.poolPumpVa,
      poolHeaterVa: easyForm.poolHeaterVa,
      evChargers: easyForm.evChargers,
      evChargerVa: easyForm.evChargerVa,
      additionalLoadsVa: easyForm.additionalLoadsVa
    };
  }

  function getSubmissionPayload() {
    return mode === "easy" ? buildPayloadFromEasyForm() : form;
  }

  function renderAdvancedPowerField(label: string, field: AdvancedPowerField) {
    const unit = advancedPowerUnits[field];
    const displayValue = convertVaToEntry(form[field], unit, form.electricalSystem as ElectricalSystemValue);
    return (
      <label className="field">
        {label} ({unitLabel(unit)})
        <input
          type="number"
          value={displayValue}
          onChange={(event) => {
            const raw = Number(event.target.value);
            const convertedVa = convertEntryToVa(Number.isFinite(raw) ? raw : 0, unit, form.electricalSystem as ElectricalSystemValue);
            setForm({ ...form, [field]: convertedVa });
          }}
        />
        {renderUnitSelect(unit, (nextUnit) => setAdvancedPowerUnits({ ...advancedPowerUnits, [field]: nextUnit }))}
      </label>
    );
  }

  function renderEasyPowerField(label: string, field: EasyPowerField) {
    const unit = easyPowerUnits[field];
    const displayValue = convertVaToEntry(easyForm[field], unit, easyForm.electricalSystem as ElectricalSystemValue);
    return (
      <label className="field">
        {label} ({unitLabel(unit)})
        <input
          type="number"
          value={displayValue}
          onChange={(event) => {
            const raw = Number(event.target.value);
            const convertedVa = convertEntryToVa(Number.isFinite(raw) ? raw : 0, unit, easyForm.electricalSystem as ElectricalSystemValue);
            setEasyForm({ ...easyForm, [field]: convertedVa });
          }}
        />
        {renderUnitSelect(unit, (nextUnit) => setEasyPowerUnits({ ...easyPowerUnits, [field]: nextUnit }))}
      </label>
    );
  }

  async function runCalculation() {
    setStatus("Calculating load...");
    const payloadBody = getSubmissionPayload();
    const response = await fetch("/api/platform/load-calculator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadBody)
    });

    const payload = (await response.json()) as { message?: string; load?: LoadResult };
    if (!response.ok || !payload.load) {
      setStatus(payload.message ?? "Could not calculate load.");
      return;
    }

    setResult(payload.load);
    setStatus("Load calculation complete.");
  }

  async function handleAssignCalculation() {
    if (!assignProjectId) {
      setAssignStatus("Select a project to assign this load calculation.");
      return;
    }

    const payloadBody = getSubmissionPayload();
    setAssignStatus("Saving load calculation...");
    const response = await fetch("/api/platform/load-calculator/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: assignProjectId,
        jobId: assignJobId || undefined,
        input: payloadBody
      })
    });

    const payload = (await response.json()) as { message?: string; load?: LoadResult; loadCalculationId?: string };
    if (!response.ok || !payload.loadCalculationId || !payload.load) {
      setAssignStatus(payload.message ?? "Could not save load calculation.");
      return;
    }

    setResult(payload.load);
    setAssignStatus(`Saved load calculation to project ${assignProjectId}${assignJobId ? ` / job ${assignJobId}` : ""}.`);
  }

  function resetCalculator() {
    setForm(DEFAULT_FORM);
    setEasyForm(DEFAULT_EASY_FORM);
    setAdvancedPowerUnits(DEFAULT_ADVANCED_UNITS);
    setEasyPowerUnits(DEFAULT_EASY_UNITS);
    setResult(null);
    setStatus("Load calculator reset.");
    setAssignStatus("");
  }

  function exportResultPdf() {
    if (!result) {
      setStatus("Run a calculation before exporting PDF.");
      return;
    }
    const payloadBody = getSubmissionPayload();
    const html = `
      <html>
        <head>
          <title>Load Calculation Report</title>
          <style>
            body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; margin: 0; padding: 24px; }
            .header { border-bottom: 2px solid #0ea5e9; margin-bottom: 16px; padding-bottom: 10px; }
            .title { margin: 0; font-size: 24px; }
            .meta { color: #475569; font-size: 13px; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #e2e8f0; padding: 8px; font-size: 13px; }
            th { text-align: left; background: #f1f5f9; }
            h2 { margin: 16px 0 8px; font-size: 16px; }
            ul { margin: 8px 0 0; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="title">Load Calculation Report</h1>
            <div class="meta">TPP GENERAL & ELECTRICAL CONTRACTORS, INC</div>
            <div class="meta">Generated: ${new Date().toLocaleString()}</div>
            <div class="meta">Project: ${assignProjectId || "Standalone"} | Job: ${assignJobId || "N/A"} | Mode: ${mode}</div>
          </div>
          <h2>Inputs</h2>
          <table>
            <tbody>
              <tr><th>Project Class</th><td>${payloadBody.projectClass}</td></tr>
              <tr><th>Electrical System</th><td>${payloadBody.electricalSystem}</td></tr>
              <tr><th>Square Feet</th><td>${payloadBody.squareFeet}</td></tr>
              <tr><th>Small Appliance Circuits</th><td>${payloadBody.smallApplianceCircuits}</td></tr>
              <tr><th>Laundry Circuits</th><td>${payloadBody.laundryCircuits}</td></tr>
              <tr><th>Dryers</th><td>${payloadBody.dryers}</td></tr>
              <tr><th>A/C Cooling (VA)</th><td>${payloadBody.hvacCoolingVa}</td></tr>
              <tr><th>Heat (VA)</th><td>${payloadBody.hvacHeatingVa}</td></tr>
              <tr><th>Pool Pump (VA)</th><td>${payloadBody.poolPumpVa}</td></tr>
              <tr><th>Pool Heater (VA)</th><td>${payloadBody.poolHeaterVa}</td></tr>
              <tr><th>EV Chargers (qty)</th><td>${payloadBody.evChargers}</td></tr>
              <tr><th>EV Charger VA each</th><td>${payloadBody.evChargerVa}</td></tr>
            </tbody>
          </table>
          <h2>Results</h2>
          <table>
            <tbody>
              <tr><th>Total VA</th><td>${result.totalVa}</td></tr>
              <tr><th>Calculated Amps</th><td>${result.calculatedAmps}</td></tr>
              <tr><th>System Voltage</th><td>${result.serviceVoltage}</td></tr>
              <tr><th>Recommended Service Size</th><td>${result.recommendedServiceSize}</td></tr>
            </tbody>
          </table>
          <h2>Assumptions</h2>
          <ul>${(result.assumptions ?? []).map((line) => `<li>${line}</li>`).join("")}</ul>
        </body>
      </html>
    `;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setStatus("Popup blocked. Allow popups to export PDF.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  return (
    <AppShell title="Load Calculator">
      <section className="card">
        <p className="muted">Run load calculations standalone, then optionally assign/save results to a project or job.</p>

        <div className="form-grid">
          <label className="field">
            Entry Mode
            <select value={mode} onChange={(event) => setMode(event.target.value as "easy" | "advanced")}>
              <option value="easy">Easy (Quick Entry)</option>
              <option value="advanced">Advanced (Detailed)</option>
            </select>
          </label>
          <p className="muted">
            Power entries can be entered as VA, Watts, or Amps. Watts are treated as VA (PF=1). Amps convert to VA using selected system voltage.
          </p>

          {mode === "easy" ? (
            <>
              <label className="field">
                Project Class
                <select value={easyForm.projectClass} onChange={(event) => setEasyForm({ ...easyForm, projectClass: event.target.value })}>
                  <option value="single_dwelling">Single Dwelling</option>
                  <option value="multifamily">Multifamily</option>
                  <option value="commercial">Commercial</option>
                </select>
              </label>

              <label className="field">
                Electrical System
                <select value={easyForm.electricalSystem} onChange={(event) => setEasyForm({ ...easyForm, electricalSystem: event.target.value })}>
                  <option value="single_120_240">Single Phase 120/240</option>
                  <option value="single_120_208">Single Phase 120/208</option>
                  <option value="three_120_208">Three Phase 120/208</option>
                  <option value="three_277_480">Three Phase 277/480</option>
                </select>
              </label>

              <label className="field">
                Square Feet
                <input type="number" value={easyForm.squareFeet} onChange={(event) => setEasyForm({ ...easyForm, squareFeet: Number(event.target.value) })} />
              </label>

              <label className="field">
                Small Appliance Circuits
                <input
                  type="number"
                  value={easyForm.smallApplianceCircuits}
                  onChange={(event) => setEasyForm({ ...easyForm, smallApplianceCircuits: Number(event.target.value) })}
                />
              </label>

              <label className="field">
                Laundry Circuits
                <input type="number" value={easyForm.laundryCircuits} onChange={(event) => setEasyForm({ ...easyForm, laundryCircuits: Number(event.target.value) })} />
              </label>

              <label className="field">
                Dryers
                <input type="number" value={easyForm.dryers} onChange={(event) => setEasyForm({ ...easyForm, dryers: Number(event.target.value) })} />
              </label>

              <label className="field">
                Kitchen / Appliance Package
                <select
                  value={easyForm.hasRange && easyForm.hasWaterHeater && easyForm.hasDishwasher && easyForm.hasDisposal && easyForm.hasMicrowave ? "full" : "custom"}
                  onChange={(event) => {
                    if (event.target.value === "full") {
                      setEasyForm({
                        ...easyForm,
                        hasRange: true,
                        hasWaterHeater: true,
                        hasDishwasher: true,
                        hasDisposal: true,
                        hasMicrowave: true
                      });
                    } else {
                      setEasyForm({
                        ...easyForm,
                        hasRange: false,
                        hasWaterHeater: false,
                        hasDishwasher: false,
                        hasDisposal: false,
                        hasMicrowave: false
                      });
                    }
                  }}
                >
                  <option value="full">Full Appliance Set</option>
                  <option value="custom">No Appliance Set</option>
                </select>
              </label>

              <label className="field">
                HVAC Type
                <select value={easyForm.hvacType} onChange={(event) => setEasyForm({ ...easyForm, hvacType: event.target.value })}>
                  <option value="none">None</option>
                  <option value="ac_only">A/C Only</option>
                  <option value="heat_pump">Heat Pump</option>
                  <option value="electric_heat">Electric Heat</option>
                </select>
              </label>

              {renderEasyPowerField("HVAC Size", "hvacSizeVa")}
              {renderEasyPowerField("Pool Pump", "poolPumpVa")}
              {renderEasyPowerField("Pool Heater", "poolHeaterVa")}

              <label className="field">
                EV Chargers (Qty)
                <input type="number" value={easyForm.evChargers} onChange={(event) => setEasyForm({ ...easyForm, evChargers: Number(event.target.value) })} />
              </label>

              {renderEasyPowerField("EV Charger per Unit", "evChargerVa")}
              {renderEasyPowerField("Additional Manual Loads", "additionalLoadsVa")}
            </>
          ) : (
            <>
          <label className="field">
            Project Class
            <select value={form.projectClass} onChange={(event) => setForm({ ...form, projectClass: event.target.value })}>
              <option value="single_dwelling">Single Dwelling</option>
              <option value="multifamily">Multifamily</option>
              <option value="commercial">Commercial</option>
            </select>
          </label>

          <label className="field">
            Electrical System
            <select value={form.electricalSystem} onChange={(event) => setForm({ ...form, electricalSystem: event.target.value })}>
              <option value="single_120_240">Single Phase 120/240</option>
              <option value="single_120_208">Single Phase 120/208</option>
              <option value="three_120_208">Three Phase 120/208</option>
              <option value="three_277_480">Three Phase 277/480</option>
            </select>
          </label>

          <label className="field">
            Square Feet
            <input type="number" value={form.squareFeet} onChange={(event) => setForm({ ...form, squareFeet: Number(event.target.value) })} />
          </label>

          <label className="field">
            Small Appliance Circuits
            <input type="number" value={form.smallApplianceCircuits} onChange={(event) => setForm({ ...form, smallApplianceCircuits: Number(event.target.value) })} />
          </label>

          <label className="field">
            Laundry Circuits
            <input type="number" value={form.laundryCircuits} onChange={(event) => setForm({ ...form, laundryCircuits: Number(event.target.value) })} />
          </label>

          <label className="field">
            Dryers
            <input type="number" value={form.dryers} onChange={(event) => setForm({ ...form, dryers: Number(event.target.value) })} />
          </label>

          {renderAdvancedPowerField("Range / Oven", "rangeVa")}
          {renderAdvancedPowerField("Water Heater", "waterHeaterVa")}
          {renderAdvancedPowerField("Dishwasher", "dishwasherVa")}
          {renderAdvancedPowerField("Disposal", "disposalVa")}
          {renderAdvancedPowerField("Microwave", "microwaveVa")}
          {renderAdvancedPowerField("A/C Cooling Load", "hvacCoolingVa")}
          {renderAdvancedPowerField("Heating Load", "hvacHeatingVa")}
          {renderAdvancedPowerField("Pool Pump", "poolPumpVa")}
          {renderAdvancedPowerField("Pool Heater", "poolHeaterVa")}

          <label className="field">
            EV Chargers (Qty)
            <input type="number" value={form.evChargers} onChange={(event) => setForm({ ...form, evChargers: Number(event.target.value) })} />
          </label>

          {renderAdvancedPowerField("EV Charger per Unit", "evChargerVa")}
          {renderAdvancedPowerField("Other Continuous Loads", "otherContinuousLoadsVa")}
          {renderAdvancedPowerField("Other Non-Continuous Loads", "otherNonContinuousLoadsVa")}
          {renderAdvancedPowerField("Largest Motor", "largestMotorVa")}
          {renderAdvancedPowerField("Additional Manual Loads", "additionalLoadsVa")}
            </>
          )}

          <div className="row actions">
            <button type="button" onClick={runCalculation}>Calculate</button>
            <button type="button" className="secondary" onClick={resetCalculator}>Reset</button>
            <button type="button" className="secondary" onClick={exportResultPdf}>Export PDF</button>
          </div>
        </div>

        {status && <p className="status-text">{status}</p>}
      </section>

      <section className="card section-gap">
        <h3>Assign Result (Optional)</h3>
        <div className="form-grid">
          <label className="field">
            Project
            <select value={assignProjectId} onChange={(event) => setAssignProjectId(event.target.value)}>
              <option value="">Not assigned</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.id})
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Job (Optional)
            <select value={assignJobId} onChange={(event) => setAssignJobId(event.target.value)} disabled={!assignProjectId}>
              <option value="">Project-level only</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.name} ({job.id})
                </option>
              ))}
            </select>
          </label>

          <div className="row actions">
            <button type="button" onClick={handleAssignCalculation}>
              Save Result to Existing Project/Job
            </button>
          </div>
        </div>
        {assignStatus && <p className="status-text">{assignStatus}</p>}
      </section>

      {result && (
        <section className="card section-gap">
          <h3>Calculation Result</h3>
          <p className="muted">
            Enter nameplate VA values for equipment loads. This calculator keeps NEC-style assumptions visible and does not guess missing values.
          </p>
          <table>
            <tbody>
              <tr><td>Lighting Load (VA)</td><td>{result.lightingLoadVa}</td></tr>
              <tr><td>Small Appliance Load (VA)</td><td>{result.smallApplianceLoadVa}</td></tr>
              <tr><td>Laundry Load (VA)</td><td>{result.laundryLoadVa}</td></tr>
              <tr><td>General Load Before Demand (VA)</td><td>{result.generalLoadVa}</td></tr>
              <tr><td>General Load After Demand (VA)</td><td>{result.demandAdjustedGeneralLoadVa}</td></tr>
              <tr><td>Dryer Load (VA)</td><td>{result.dryerLoadVa}</td></tr>
              <tr><td>Range / Oven Load (VA)</td><td>{result.rangeLoadVa}</td></tr>
              <tr><td>Water Heater Load (VA)</td><td>{result.waterHeaterLoadVa}</td></tr>
              <tr><td>Dishwasher Load (VA)</td><td>{result.dishwasherLoadVa}</td></tr>
              <tr><td>Disposal Load (VA)</td><td>{result.disposalLoadVa}</td></tr>
              <tr><td>Microwave Load (VA)</td><td>{result.microwaveLoadVa}</td></tr>
              <tr><td>HVAC Noncoincident Load (VA)</td><td>{result.hvacNonCoincidentLoadVa}</td></tr>
              <tr><td>Pool Pump Load (VA)</td><td>{result.poolPumpLoadVa}</td></tr>
              <tr><td>Pool Heater Load (VA)</td><td>{result.poolHeaterLoadVa}</td></tr>
              <tr><td>EV Load Base (VA)</td><td>{result.evLoadVa}</td></tr>
              <tr><td>EV Load Adjusted 125% (VA)</td><td>{result.adjustedEvLoadVa}</td></tr>
              <tr><td>Other Continuous Base (VA)</td><td>{result.otherContinuousLoadsVa}</td></tr>
              <tr><td>Other Continuous Adjusted 125% (VA)</td><td>{result.adjustedOtherContinuousLoadsVa}</td></tr>
              <tr><td>Other Non-Continuous Loads (VA)</td><td>{result.otherNonContinuousLoadsVa}</td></tr>
              <tr><td>Largest Motor Adder (VA)</td><td>{result.largestMotorAdderVa}</td></tr>
              <tr><td>Total VA</td><td>{result.totalVa}</td></tr>
              <tr><td>System Voltage</td><td>{result.serviceVoltage}</td></tr>
              <tr><td>Calculated Amps</td><td>{result.calculatedAmps}</td></tr>
              <tr><td>Recommended Service Size</td><td>{result.recommendedServiceSize}</td></tr>
            </tbody>
          </table>
          {result.assumptions && result.assumptions.length > 0 && (
            <>
              <h3 className="section-gap">Assumptions Used</h3>
              <ul>
                {result.assumptions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </AppShell>
  );
}
