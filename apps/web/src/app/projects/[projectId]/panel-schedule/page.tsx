"use client";

import type { ProjectPanelSchedule } from "@package/types";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../../../components/app-shell";

type Payload = {
  panelSchedule: ProjectPanelSchedule;
};

export default function ProjectPanelSchedulePage() {
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  const [status, setStatus] = useState("Loading panel schedule...");
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    void loadLatest();
  }, [jobId, params.projectId]);

  async function loadLatest() {
    const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
    const response = await fetch(`/api/projects/${params.projectId}/panel-schedule${query}`, {
      cache: "no-store"
    });
    const payload = (await response.json()) as Partial<Payload> & { message?: string };

    if (!response.ok || !payload.panelSchedule) {
      setData(null);
      setStatus(payload.message ?? "No saved panel schedule yet.");
      return;
    }

    setData({ panelSchedule: payload.panelSchedule });
    setStatus("");
  }

  async function generateSchedule() {
    setStatus("Generating panel schedule...");
    const response = await fetch(`/api/projects/${params.projectId}/panel-schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includeDefaults: true, jobId })
    });
    const payload = (await response.json()) as Partial<Payload> & { message?: string };

    if (!response.ok || !payload.panelSchedule) {
      setStatus(payload.message ?? "Could not generate panel schedule.");
      return;
    }

    setData({ panelSchedule: payload.panelSchedule });
    setStatus("Panel schedule generated and saved.");
  }

  return (
    <AppShell title="Project Panel Schedule">
      <section className="card">
        <p className="muted">
          Generates panel schedule rows from the current dedicated-circuit workflow and stores each run by project.
        </p>
        <div className="row actions">
          <button type="button" onClick={generateSchedule}>
            Generate Panel Schedule
          </button>
        </div>
      </section>

      {status && <section className="card section-gap"><p className="status-text">{status}</p></section>}

      {data && (
        <section className="card section-gap">
          <h3>Latest Schedule</h3>
          <p className="muted">
            Schedule ID: {data.panelSchedule.scheduleId} | Created: {new Date(data.panelSchedule.createdAt).toLocaleString()}
          </p>
          <table>
            <thead>
              <tr>
                <th>Circuit</th>
                <th>Breaker Size</th>
                <th>Wire Type</th>
                <th>Load Description</th>
              </tr>
            </thead>
            <tbody>
              {data.panelSchedule.rows.map((row) => (
                <tr key={row.circuit}>
                  <td>{row.circuit}</td>
                  <td>{row.breakerSize}</td>
                  <td>{row.wireType}</td>
                  <td>{row.loadDescription}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </AppShell>
  );
}
