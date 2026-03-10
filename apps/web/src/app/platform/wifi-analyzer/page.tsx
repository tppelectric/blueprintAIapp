"use client";

import type { CreateProjectJobInput, JobType, Project, ProjectJob } from "@package/types";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "../../../components/app-shell";

type WifiPlan = {
  recommendedAccessPoints: number;
  coverageDrivenAps: number;
  capacityDrivenAps: number;
  suggestedController: string;
  recommendedSwitchPorts: number;
  estimatedCat6Feet: number;
  estimatedLaborHours: number;
  rackCount: number;
  targetChannelWidthMHz: number;
  suggested5ghzChannels: number[];
  estimatedPoeWatts: number;
  recommendedGear: Array<{
    vendor: string;
    category: string;
    model: string;
    quantity: number;
    notes: string;
  }>;
  billOfMaterials: Array<{
    category: string;
    item: string;
    quantity: number;
    unit: string;
    estimatedUnitCostUsd: number;
    estimatedExtendedCostUsd: number;
  }>;
  placementZones: string[];
  assumptions: string[];
  notes: string[];
};

type NetworkObservation = {
  ssid: string;
  band: "2.4GHz" | "5GHz";
  channel: number;
  rssiDbm: number;
};

type NetworkScanHistoryItem = {
  id: string;
  projectId: string | null;
  jobId: string | null;
  scanName: string | null;
  createdAt: string;
  result: {
    totalNetworks: number;
    avgRssiDbm: number;
    strongestSignalDbm: number;
    weakestSignalDbm: number;
    channelCongestion: Array<{ band: "2.4GHz" | "5GHz"; channel: number; networkCount: number }>;
    qualitySummary: { strongCount: number; fairCount: number; weakCount: number };
    recommendations: string[];
  };
};

export default function WifiAnalyzerPage() {
  const [form, setForm] = useState({
    squareFeet: 3200,
    floors: 2,
    wallDensity: "medium",
    wallType: "drywall",
    insulationType: "fiberglass",
    structuralMetal: "none",
    vendorProfile: "ubiquiti",
    highDensityRooms: 3,
    includeOutdoorCoverage: true,
    throughputTargetMbps: 300,
    concurrentUsers: 35,
    avgDeviceMbps: 8,
    poeHeadroomPercent: 25
  });
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState<WifiPlan | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [jobs, setJobs] = useState<ProjectJob[]>([]);
  const [assignProjectId, setAssignProjectId] = useState("");
  const [assignJobId, setAssignJobId] = useState("");
  const [assignStatus, setAssignStatus] = useState("");
  const [createNewJob, setCreateNewJob] = useState(false);
  const [newJob, setNewJob] = useState<CreateProjectJobInput>({
    jobName: "WiFi Design",
    jobType: "low_voltage_estimate",
    description: "WiFi analyzer design package"
  });
  const [scanName, setScanName] = useState("Site RF Scan");
  const [observations, setObservations] = useState<NetworkObservation[]>([
    { ssid: "Corp-WiFi", band: "5GHz", channel: 36, rssiDbm: -62 }
  ]);
  const [scanStatus, setScanStatus] = useState("");
  const [scanHistory, setScanHistory] = useState<NetworkScanHistoryItem[]>([]);
  const [selectedScan, setSelectedScan] = useState<NetworkScanHistoryItem | null>(null);

  async function loadNetworkScanHistory() {
    const params = new URLSearchParams();
    if (assignProjectId) {
      params.set("projectId", assignProjectId);
    }
    if (assignJobId) {
      params.set("jobId", assignJobId);
    }
    params.set("limit", "25");
    const response = await fetch(`/api/platform/wifi-analyzer/network-scan?${params.toString()}`, { cache: "no-store" });
    const payload = (await response.json()) as { history?: NetworkScanHistoryItem[] };
    const nextHistory = payload.history ?? [];
    setScanHistory(nextHistory);
    if (nextHistory.length > 0 && !selectedScan) {
      setSelectedScan(nextHistory[0]);
    }
  }

  useEffect(() => {
    void loadNetworkScanHistory();
  }, [assignProjectId, assignJobId]);

  function downloadBomCsv() {
    if (!plan) {
      setStatus("Run the WiFi analyzer first to generate a BOM.");
      return;
    }

    const headers = [
      "Category",
      "Item",
      "Quantity",
      "Unit",
      "Estimated Unit Cost (USD)",
      "Estimated Extended Cost (USD)"
    ];
    const rows = plan.billOfMaterials.map((item) => [
      item.category,
      item.item,
      String(item.quantity),
      item.unit,
      String(item.estimatedUnitCostUsd),
      String(item.estimatedExtendedCostUsd)
    ]);

    const toCsvCell = (value: string): string => {
      const escaped = value.replace(/"/g, "\"\"");
      return `"${escaped}"`;
    };

    const csv = [headers, ...rows].map((row) => row.map((cell) => toCsvCell(cell)).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url;
    link.download = `wifi-bom-${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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

  async function runWifiAnalyzer() {
    setStatus("Running WiFi analyzer...");
    const response = await fetch("/api/platform/wifi-analyzer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const payload = (await response.json()) as { message?: string; wifiPlan?: WifiPlan };
    if (!response.ok || !payload.wifiPlan) {
      setStatus(payload.message ?? "Could not generate WiFi plan.");
      return;
    }
    setPlan(payload.wifiPlan);
    setStatus("WiFi plan generated.");
  }

  async function assignWifiPlan() {
    if (!assignProjectId) {
      setAssignStatus("Select a project to assign this WiFi plan.");
      return;
    }

    let targetJobId = assignJobId || undefined;
    if (createNewJob) {
      if (!newJob.jobName.trim() || !newJob.description.trim()) {
        setAssignStatus("Enter a job name and description before creating a new job.");
        return;
      }
      setAssignStatus("Creating job and saving WiFi plan...");
      const createJobResponse = await fetch(`/api/projects/${assignProjectId}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobName: newJob.jobName.trim(),
          jobType: newJob.jobType,
          description: newJob.description.trim()
        })
      });
      const createJobPayload = (await createJobResponse.json()) as { message?: string; job?: ProjectJob };
      if (!createJobResponse.ok || !createJobPayload.job) {
        setAssignStatus(createJobPayload.message ?? "Could not create a new job.");
        return;
      }
      targetJobId = createJobPayload.job.id;
      setJobs((existing) => [createJobPayload.job as ProjectJob, ...existing]);
      setAssignJobId(targetJobId);
    }

    setAssignStatus("Saving WiFi plan...");
    const response = await fetch("/api/platform/wifi-analyzer/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: assignProjectId,
        jobId: targetJobId,
        input: form
      })
    });
    const payload = (await response.json()) as { message?: string; wifiDesignId?: string; wifiPlan?: WifiPlan };
    if (!response.ok || !payload.wifiDesignId || !payload.wifiPlan) {
      setAssignStatus(payload.message ?? "Could not assign WiFi plan.");
      return;
    }
    setPlan(payload.wifiPlan);
    setAssignStatus(`Saved WiFi plan to project ${assignProjectId}${targetJobId ? ` / job ${targetJobId}` : ""}.`);
  }

  async function runAiAnalyzeFromPlans() {
    if (!assignProjectId) {
      setStatus("Select a project first for AI plan analysis.");
      return;
    }
    setStatus("Running AI analysis from imported plans...");
    const response = await fetch("/api/platform/wifi-analyzer/ai-from-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: assignProjectId,
        jobId: assignJobId || undefined,
        wallType: form.wallType,
        insulationType: form.insulationType,
        structuralMetal: form.structuralMetal,
        vendorProfile: form.vendorProfile,
        includeOutdoorCoverage: form.includeOutdoorCoverage,
        throughputTargetMbps: form.throughputTargetMbps,
        concurrentUsers: form.concurrentUsers,
        avgDeviceMbps: form.avgDeviceMbps,
        poeHeadroomPercent: form.poeHeadroomPercent
      })
    });
    const payload = (await response.json()) as {
      message?: string;
      derivedInput?: typeof form;
      wifiPlan?: WifiPlan;
    };
    if (!response.ok || !payload.wifiPlan || !payload.derivedInput) {
      setStatus(payload.message ?? "Could not analyze imported plans for WiFi.");
      return;
    }

    setForm(payload.derivedInput);
    setPlan(payload.wifiPlan);
    setStatus("AI analysis complete using imported plan data.");
  }

  function updateObservation(index: number, patch: Partial<NetworkObservation>) {
    setObservations((rows) =>
      rows.map((row, i) => {
        if (i !== index) {
          return row;
        }
        return { ...row, ...patch };
      })
    );
  }

  function addObservation() {
    setObservations((rows) => [...rows, { ssid: "", band: "5GHz", channel: 149, rssiDbm: -70 }]);
  }

  function removeObservation(index: number) {
    setObservations((rows) => rows.filter((_, i) => i !== index));
  }

  function resetNetworkScan() {
    setScanName("Site RF Scan");
    setObservations([{ ssid: "", band: "5GHz", channel: 149, rssiDbm: -70 }]);
    setSelectedScan(null);
    setScanStatus("Network scan form reset.");
  }

  async function runNetworkScan() {
    setScanStatus("Running network scan analysis...");
    const response = await fetch("/api/platform/wifi-analyzer/network-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: assignProjectId || undefined,
        jobId: assignJobId || undefined,
        scanName: scanName.trim() || undefined,
        observations
      })
    });
    const payload = (await response.json()) as { message?: string; scan?: NetworkScanHistoryItem };
    if (!response.ok || !payload.scan) {
      setScanStatus(payload.message ?? "Could not run network scan.");
      return;
    }
    setSelectedScan(payload.scan);
    setScanStatus("Network scan saved.");
    await loadNetworkScanHistory();
  }

  async function runAutoNetworkScan() {
    setScanStatus("Running auto scan from this device...");
    const response = await fetch("/api/platform/wifi-analyzer/network-scan/auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: assignProjectId || undefined,
        jobId: assignJobId || undefined,
        scanName: scanName.trim() || undefined
      })
    });
    const payload = (await response.json()) as {
      message?: string;
      scan?: NetworkScanHistoryItem;
      observationsCaptured?: number;
    };
    if (!response.ok || !payload.scan) {
      setScanStatus(payload.message ?? "Could not run auto network scan.");
      return;
    }

    setSelectedScan(payload.scan);
    setScanStatus(
      `Auto scan saved from this device (${payload.observationsCaptured ?? 0} networks detected).`
    );
    await loadNetworkScanHistory();
  }

  function exportNetworkScanPdf(scan?: NetworkScanHistoryItem) {
    const targetScan = scan ?? selectedScan;
    if (!targetScan) {
      setScanStatus("Run or select a saved network scan first.");
      return;
    }
    const congestionRows = targetScan.result.channelCongestion
      .map(
        (entry) =>
          `<tr><td>${entry.band}</td><td>${entry.channel}</td><td style="text-align:right;">${entry.networkCount}</td></tr>`
      )
      .join("");
    const recommendationRows = targetScan.result.recommendations.map((item) => `<li>${item}</li>`).join("");
    const html = `
      <html>
        <head>
          <title>WiFi Network Scan Report</title>
          <style>
            body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; margin: 0; padding: 28px; }
            .header { border-bottom: 2px solid #0ea5e9; margin-bottom: 18px; padding-bottom: 12px; }
            .title { font-size: 24px; margin: 0 0 6px 0; }
            .subtle { color: #475569; font-size: 13px; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 14px 0 18px; }
            .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; background: #f8fafc; }
            .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
            .value { font-size: 18px; font-weight: 600; margin-top: 2px; }
            h2 { margin: 14px 0 8px; font-size: 16px; }
            table { width: 100%; border-collapse: collapse; margin-top: 6px; }
            th, td { border: 1px solid #e2e8f0; padding: 8px; font-size: 13px; }
            th { background: #f1f5f9; text-align: left; }
            ul { margin-top: 8px; }
            .footer { margin-top: 24px; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="title">WiFi Network Scan Report</h1>
            <div class="subtle">TPP GENERAL & ELECTRICAL CONTRACTORS, INC</div>
            <div class="subtle">Scan Name: ${targetScan.scanName ?? "Unnamed Scan"}</div>
            <div class="subtle">Project: ${targetScan.projectId ?? "N/A"} | Job: ${targetScan.jobId ?? "N/A"}</div>
            <div class="subtle">Created: ${new Date(targetScan.createdAt).toLocaleString()}</div>
          </div>
          <div class="grid">
            <div class="card"><div class="label">Total Networks</div><div class="value">${targetScan.result.totalNetworks}</div></div>
            <div class="card"><div class="label">Average RSSI</div><div class="value">${targetScan.result.avgRssiDbm} dBm</div></div>
            <div class="card"><div class="label">Strongest Signal</div><div class="value">${targetScan.result.strongestSignalDbm} dBm</div></div>
            <div class="card"><div class="label">Weakest Signal</div><div class="value">${targetScan.result.weakestSignalDbm} dBm</div></div>
          </div>
          <h2>Channel Congestion</h2>
          <table>
            <thead>
              <tr><th>Band</th><th>Channel</th><th>Network Count</th></tr>
            </thead>
            <tbody>
              ${congestionRows || `<tr><td colspan="3">No congestion data available.</td></tr>`}
            </tbody>
          </table>
          <h2>Recommendations</h2>
          <ul>${recommendationRows}</ul>
          <div class="footer">Generated by AI Blueprint Scan App WiFi Analyzer</div>
        </body>
      </html>
    `;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setScanStatus("Popup blocked. Allow popups to export PDF.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  async function deleteNetworkScan(scanId: string) {
    const confirmed = window.confirm("Delete this saved network scan?");
    if (!confirmed) {
      return;
    }
    setScanStatus("Deleting network scan...");
    const response = await fetch(`/api/platform/wifi-analyzer/network-scan/${encodeURIComponent(scanId)}`, {
      method: "DELETE"
    });
    const payload = (await response.json()) as { message?: string };
    if (!response.ok) {
      setScanStatus(payload.message ?? "Could not delete network scan.");
      return;
    }

    if (selectedScan?.id === scanId) {
      setSelectedScan(null);
    }
    await loadNetworkScanHistory();
    setScanStatus("Network scan deleted.");
  }

  return (
    <AppShell title="WiFi Analyzer / Builder">
      <section className="card">
        <p className="muted">Standalone planning tool for AP count, cabling estimate, and placement zones.</p>

        <div className="form-grid">
          <label className="field">
            Square Feet
            <input type="number" value={form.squareFeet} onChange={(event) => setForm({ ...form, squareFeet: Number(event.target.value) })} />
          </label>

          <label className="field">
            Floors
            <input type="number" value={form.floors} onChange={(event) => setForm({ ...form, floors: Number(event.target.value) })} />
          </label>

          <label className="field">
            Wall Density
            <select value={form.wallDensity} onChange={(event) => setForm({ ...form, wallDensity: event.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>

          <label className="field">
            Wall Type
            <select value={form.wallType} onChange={(event) => setForm({ ...form, wallType: event.target.value })}>
              <option value="drywall">Drywall</option>
              <option value="plaster">Plaster</option>
              <option value="concrete_block">Concrete Block</option>
              <option value="brick">Brick</option>
              <option value="metal_stud">Metal Stud Wall</option>
            </select>
          </label>

          <label className="field">
            Insulation
            <select value={form.insulationType} onChange={(event) => setForm({ ...form, insulationType: event.target.value })}>
              <option value="none">None</option>
              <option value="fiberglass">Fiberglass</option>
              <option value="mineral_wool">Mineral Wool</option>
              <option value="spray_foam">Spray Foam</option>
              <option value="foil_faced">Foil Faced</option>
            </select>
          </label>

          <label className="field">
            Structural Metal
            <select value={form.structuralMetal} onChange={(event) => setForm({ ...form, structuralMetal: event.target.value })}>
              <option value="none">None</option>
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="heavy">Heavy</option>
            </select>
          </label>

          <label className="field">
            Preferred Gear Profile
            <select value={form.vendorProfile} onChange={(event) => setForm({ ...form, vendorProfile: event.target.value })}>
              <option value="ubiquiti">Ubiquiti (Primary)</option>
              <option value="generic">Generic</option>
            </select>
          </label>

          <label className="field">
            High Density Rooms
            <input
              type="number"
              value={form.highDensityRooms}
              onChange={(event) => setForm({ ...form, highDensityRooms: Number(event.target.value) })}
            />
          </label>

          <label className="field">
            Throughput Target (Mbps)
            <input
              type="number"
              value={form.throughputTargetMbps}
              onChange={(event) => setForm({ ...form, throughputTargetMbps: Number(event.target.value) })}
            />
          </label>

          <label className="field">
            Concurrent Users
            <input
              type="number"
              value={form.concurrentUsers}
              onChange={(event) => setForm({ ...form, concurrentUsers: Number(event.target.value) })}
            />
          </label>

          <label className="field">
            Avg Mbps Per User
            <input
              type="number"
              value={form.avgDeviceMbps}
              onChange={(event) => setForm({ ...form, avgDeviceMbps: Number(event.target.value) })}
            />
          </label>

          <label className="field">
            PoE Headroom (%)
            <input
              type="number"
              value={form.poeHeadroomPercent}
              onChange={(event) => setForm({ ...form, poeHeadroomPercent: Number(event.target.value) })}
            />
          </label>

          <label className="field">
            Include Outdoor Coverage
            <select
              value={String(form.includeOutdoorCoverage)}
              onChange={(event) => setForm({ ...form, includeOutdoorCoverage: event.target.value === "true" })}
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>

          <div className="row actions">
            <button type="button" onClick={runWifiAnalyzer}>Run WiFi Analyzer</button>
          </div>
        </div>
        {status && <p className="status-text">{status}</p>}
      </section>

      <section className="card section-gap">
        <h3>Assign Result (Optional)</h3>
        <p className="muted">Run independently, then assign/save to a project or specific job. You can also analyze from imported plans.</p>
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

          <label className="field">
            Create New Job Instead
            <select
              value={createNewJob ? "yes" : "no"}
              onChange={(event) => setCreateNewJob(event.target.value === "yes")}
              disabled={!assignProjectId}
            >
              <option value="no">No (use existing job)</option>
              <option value="yes">Yes (create job now)</option>
            </select>
          </label>

          {createNewJob && (
            <>
              <label className="field">
                New Job Name
                <input
                  value={newJob.jobName}
                  onChange={(event) => setNewJob({ ...newJob, jobName: event.target.value })}
                  placeholder="WiFi Design"
                />
              </label>

              <label className="field">
                New Job Type
                <select
                  value={newJob.jobType}
                  onChange={(event) =>
                    setNewJob({
                      ...newJob,
                      jobType: event.target.value as JobType
                    })
                  }
                >
                  <option value="electrical_estimate">Electrical Estimate</option>
                  <option value="low_voltage_estimate">Low Voltage Estimate</option>
                  <option value="lighting_upgrade">Lighting Upgrade</option>
                  <option value="service_upgrade">Service Upgrade</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label className="field">
                New Job Description
                <input
                  value={newJob.description}
                  onChange={(event) => setNewJob({ ...newJob, description: event.target.value })}
                  placeholder="Scope for this WiFi design job"
                />
              </label>
            </>
          )}

          <div className="row actions">
            <button type="button" onClick={assignWifiPlan}>
              {createNewJob ? "Create Job + Save to Project/Job" : "Run + Save to Project/Job"}
            </button>
            <button type="button" className="secondary" onClick={runAiAnalyzeFromPlans}>
              AI Analyze Imported Plans
            </button>
            {assignProjectId && (
              <Link className="button-link secondary" href={`/projects/${assignProjectId}/import${assignJobId ? `?jobId=${encodeURIComponent(assignJobId)}` : ""}`}>
                Import Plans
              </Link>
            )}
          </div>
        </div>
        {assignStatus && <p className="status-text">{assignStatus}</p>}
      </section>

      <section className="card section-gap">
        <h3>Network Scan (On-Site)</h3>
        <p className="muted">Enter observed SSIDs/channels/RSSI values, save scan history, and export printable PDF report.</p>

        <div className="form-grid">
          <label className="field">
            Scan Name
            <input value={scanName} onChange={(event) => setScanName(event.target.value)} />
          </label>
        </div>

        <table className="section-gap">
          <thead>
            <tr>
              <th>SSID</th>
              <th>Band</th>
              <th>Channel</th>
              <th>RSSI (dBm)</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {observations.map((row, index) => (
              <tr key={`obs-${index}`}>
                <td>
                  <input value={row.ssid} onChange={(event) => updateObservation(index, { ssid: event.target.value })} />
                </td>
                <td>
                  <select value={row.band} onChange={(event) => updateObservation(index, { band: event.target.value as "2.4GHz" | "5GHz" })}>
                    <option value="2.4GHz">2.4GHz</option>
                    <option value="5GHz">5GHz</option>
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    value={row.channel}
                    onChange={(event) => updateObservation(index, { channel: Number(event.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={row.rssiDbm}
                    onChange={(event) => updateObservation(index, { rssiDbm: Number(event.target.value) })}
                  />
                </td>
                <td>
                  <button type="button" className="secondary" onClick={() => removeObservation(index)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="row actions">
          <button type="button" className="secondary" onClick={addObservation}>
            Add Network
          </button>
          <button type="button" className="secondary" onClick={resetNetworkScan}>
            Reset Scan
          </button>
          <button type="button" className="secondary" onClick={runAutoNetworkScan}>
            Auto Scan (This Device)
          </button>
          <button type="button" onClick={runNetworkScan}>
            Run Network Scan
          </button>
          <button type="button" className="secondary" onClick={() => exportNetworkScanPdf()}>
            Export Scan PDF
          </button>
        </div>
        {scanStatus && <p className="status-text">{scanStatus}</p>}
      </section>

      <section className="card section-gap">
        <h3>Saved Network Scan History</h3>
        <div className="row actions">
          <button type="button" className="secondary" onClick={() => void loadNetworkScanHistory()}>
            Refresh Scan History
          </button>
        </div>
        {scanHistory.length === 0 ? (
          <p className="muted">No network scans saved yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Scan</th>
                <th>Project</th>
                <th>Job</th>
                <th>Created</th>
                <th>Total Networks</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {scanHistory.map((item) => (
                <tr key={item.id}>
                  <td>{item.scanName ?? "Unnamed Scan"}</td>
                  <td>{item.projectId ?? "N/A"}</td>
                  <td>{item.jobId ?? "N/A"}</td>
                  <td>{item.createdAt}</td>
                  <td>{item.result.totalNetworks}</td>
                  <td>
                    <button type="button" className="secondary" onClick={() => setSelectedScan(item)}>
                      View
                    </button>
                    <button type="button" className="secondary" onClick={() => exportNetworkScanPdf(item)}>
                      Export PDF
                    </button>
                    <button type="button" className="secondary" onClick={() => void deleteNetworkScan(item.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {selectedScan && (
        <section className="card section-gap">
          <h3>Selected Network Scan Result</h3>
          <p className="muted">{selectedScan.scanName ?? "Unnamed Scan"}</p>
          <p>Total Networks: {selectedScan.result.totalNetworks}</p>
          <p>Average RSSI: {selectedScan.result.avgRssiDbm} dBm</p>
          <p>Strongest Signal: {selectedScan.result.strongestSignalDbm} dBm</p>
          <p>Weakest Signal: {selectedScan.result.weakestSignalDbm} dBm</p>
          <h3 className="section-gap">Recommendations</h3>
          <ul>
            {selectedScan.result.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {plan && (
        <section className="card section-gap">
          <details open>
            <summary>
              WiFi Plan Results: {plan.recommendedAccessPoints} APs | {plan.estimatedCat6Feet} ft CAT6 | {plan.estimatedLaborHours} labor hrs
            </summary>
            <table className="section-gap">
              <tbody>
                <tr><td>Recommended Access Points</td><td>{plan.recommendedAccessPoints}</td></tr>
                <tr><td>Coverage-Driven APs</td><td>{plan.coverageDrivenAps}</td></tr>
                <tr><td>Capacity-Driven APs</td><td>{plan.capacityDrivenAps}</td></tr>
                <tr><td>Suggested Controller</td><td>{plan.suggestedController}</td></tr>
                <tr><td>Recommended Switch Ports</td><td>{plan.recommendedSwitchPorts}</td></tr>
                <tr><td>Target Channel Width</td><td>{plan.targetChannelWidthMHz} MHz</td></tr>
                <tr><td>Suggested 5GHz Channels</td><td>{plan.suggested5ghzChannels.join(", ")}</td></tr>
                <tr><td>Estimated CAT6 (ft)</td><td>{plan.estimatedCat6Feet}</td></tr>
                <tr><td>Estimated PoE Budget (W)</td><td>{plan.estimatedPoeWatts}</td></tr>
                <tr><td>Estimated Labor Hours</td><td>{plan.estimatedLaborHours}</td></tr>
                <tr><td>Rack Count</td><td>{plan.rackCount}</td></tr>
              </tbody>
            </table>

            <h3 className="section-gap">Assumptions</h3>
            <ul>
              {plan.assumptions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h3 className="section-gap">Placement Zones</h3>
            <ul>
              {plan.placementZones.map((zone) => (
                <li key={zone}>{zone}</li>
              ))}
            </ul>

            <h3 className="section-gap">Recommended Gear</h3>
            <table>
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Category</th>
                  <th>Model</th>
                  <th>Qty</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {plan.recommendedGear.map((gear) => (
                  <tr key={`${gear.vendor}-${gear.category}-${gear.model}`}>
                    <td>{gear.vendor}</td>
                    <td>{gear.category}</td>
                    <td>{gear.model}</td>
                    <td>{gear.quantity}</td>
                    <td>{gear.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>

          <details className="section-gap" open>
            <summary>
              Bill of Materials: {plan.billOfMaterials.length} items | $
              {plan.billOfMaterials.reduce((sum, item) => sum + item.estimatedExtendedCostUsd, 0).toFixed(2)} estimated total
            </summary>
            <div className="row actions section-gap">
              <button type="button" onClick={downloadBomCsv}>
                Export BOM CSV
              </button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Unit Cost (USD)</th>
                  <th>Extended Cost (USD)</th>
                </tr>
              </thead>
              <tbody>
                {plan.billOfMaterials.map((item) => (
                  <tr key={`${item.category}-${item.item}`}>
                    <td>{item.category}</td>
                    <td>{item.item}</td>
                    <td>{item.quantity}</td>
                    <td>{item.unit}</td>
                    <td>{item.estimatedUnitCostUsd}</td>
                    <td>{item.estimatedExtendedCostUsd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>

          <h3 className="section-gap">Notes</h3>
          <ul>
            {plan.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}
