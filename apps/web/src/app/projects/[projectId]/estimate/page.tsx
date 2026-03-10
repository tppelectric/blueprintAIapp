"use client";

import type { EstimateResult, FinishLevel, PointBreakdown } from "@package/types";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../../../components/app-shell";

type EstimatePayload = {
  estimateId: string;
  points: PointBreakdown;
  estimate: EstimateResult;
  createdAt: string;
};

const FINISH_LEVELS: Array<{ value: FinishLevel; label: string }> = [
  { value: "builder_grade", label: "Builder Grade" },
  { value: "mid_range_residential", label: "Mid Range Residential" },
  { value: "high_end_residential", label: "High End Residential" }
];

export default function ProjectEstimatePage() {
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  const [status, setStatus] = useState("Loading latest estimate...");
  const [estimateData, setEstimateData] = useState<EstimatePayload | null>(null);
  const [laborCostPerPoint, setLaborCostPerPoint] = useState(65);
  const [materialCostPerPoint, setMaterialCostPerPoint] = useState(48);
  const [markupMultiplier, setMarkupMultiplier] = useState(1.22);
  const [baseLaborHoursPerPoint, setBaseLaborHoursPerPoint] = useState(0.55);
  const [finishLevel, setFinishLevel] = useState<FinishLevel>("mid_range_residential");

  useEffect(() => {
    void (async () => {
      const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
      const response = await fetch(`/api/projects/${params.projectId}/estimate${query}`, { cache: "no-store" });
      const payload = (await response.json()) as Partial<EstimatePayload> & { message?: string };

      if (!response.ok || !payload.estimate || !payload.points || !payload.estimateId || !payload.createdAt) {
        setStatus(payload.message ?? "No saved estimate yet. Run estimate to generate one.");
        return;
      }

      setEstimateData({
        estimateId: payload.estimateId,
        points: payload.points,
        estimate: payload.estimate,
        createdAt: payload.createdAt
      });
      setStatus("");
    })();
  }, [jobId, params.projectId]);

  async function runEstimate() {
    setStatus("Running estimate from project takeoff...");

    const response = await fetch(`/api/projects/${params.projectId}/estimate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        laborCostPerPoint,
        materialCostPerPoint,
        markupMultiplier,
        baseLaborHoursPerPoint,
        jobId,
        finishLevel
      })
    });

    const payload = (await response.json()) as
      | (EstimatePayload & { message?: string })
      | { message?: string; estimate?: EstimateResult; points?: PointBreakdown; estimateId?: string; createdAt?: string };

    if (!response.ok || !("estimate" in payload) || !("points" in payload) || !("estimateId" in payload) || !("createdAt" in payload)) {
      setStatus(("message" in payload && payload.message) || "Could not run estimate.");
      return;
    }

    setEstimateData({
      estimateId: payload.estimateId as string,
      points: payload.points as PointBreakdown,
      estimate: payload.estimate as EstimateResult,
      createdAt: payload.createdAt as string
    });
    setStatus("Estimate generated and saved.");
  }

  return (
    <AppShell title="Project Estimate">
      <section className="card">
        <h3>Estimate Inputs</h3>
        <p className="muted">Uses project takeoff counts and room area as the estimate base.</p>

        <div className="form-grid">
          <label className="field">
            Labor Cost / Point
            <input type="number" value={laborCostPerPoint} onChange={(event) => setLaborCostPerPoint(Number(event.target.value))} />
          </label>

          <label className="field">
            Material Cost / Point
            <input type="number" value={materialCostPerPoint} onChange={(event) => setMaterialCostPerPoint(Number(event.target.value))} />
          </label>

          <label className="field">
            Markup Multiplier
            <input type="number" step="0.01" value={markupMultiplier} onChange={(event) => setMarkupMultiplier(Number(event.target.value))} />
          </label>

          <label className="field">
            Base Labor Hours / Point
            <input type="number" step="0.01" value={baseLaborHoursPerPoint} onChange={(event) => setBaseLaborHoursPerPoint(Number(event.target.value))} />
          </label>

          <label className="field">
            Finish Level
            <select value={finishLevel} onChange={(event) => setFinishLevel(event.target.value as FinishLevel)}>
              {FINISH_LEVELS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <div className="row actions">
            <button type="button" onClick={runEstimate}>
              Run Project Estimate
            </button>
          </div>
        </div>
      </section>

      {status && <section className="card section-gap"><p className="status-text">{status}</p></section>}

      {estimateData && (
        <>
          <section className="card section-gap">
            <h3>Point Breakdown</h3>
            <table>
              <tbody>
                <tr><td>Receptacles</td><td>{estimateData.points.receptacles}</td></tr>
                <tr><td>Switches</td><td>{estimateData.points.switches}</td></tr>
                <tr><td>Lights</td><td>{estimateData.points.lights}</td></tr>
                <tr><td>Data Ports</td><td>{estimateData.points.dataPorts}</td></tr>
                <tr><td>Low Voltage</td><td>{estimateData.points.lowVoltage}</td></tr>
              </tbody>
            </table>
          </section>

          <section className="card section-gap">
            <h3>Estimate Result</h3>
            <table>
              <tbody>
                <tr><td>Estimate ID</td><td>{estimateData.estimateId}</td></tr>
                <tr><td>Created</td><td>{new Date(estimateData.createdAt).toLocaleString()}</td></tr>
                <tr><td>Total Points</td><td>{estimateData.estimate.totalPoints}</td></tr>
                <tr><td>Price Per Point</td><td>${estimateData.estimate.pricePerPoint}</td></tr>
                <tr><td>Total Labor Hours</td><td>{estimateData.estimate.laborHours}</td></tr>
                <tr><td>Total Labor Cost</td><td>${estimateData.estimate.laborCost}</td></tr>
                <tr><td>Total Material Cost</td><td>${estimateData.estimate.materialCost}</td></tr>
                <tr><td>Total Project Cost</td><td>${estimateData.estimate.totalProjectCost}</td></tr>
                <tr><td>Price Per Sq Ft</td><td>${estimateData.estimate.pricePerSqFt}</td></tr>
              </tbody>
            </table>
          </section>
        </>
      )}
    </AppShell>
  );
}
