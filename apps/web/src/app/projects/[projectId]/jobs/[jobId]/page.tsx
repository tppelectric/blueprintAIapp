"use client";

import type { DashboardData } from "@package/types";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../../../../components/app-shell";

export default function JobWorkspacePage() {
  const params = useParams<{ projectId: string; jobId: string }>();
  const searchParams = useSearchParams();
  const [workspace, setWorkspace] = useState<DashboardData | null>(null);
  const [status, setStatus] = useState("Loading job workspace...");

  useEffect(() => {
    void (async () => {
      const response = await fetch(`/api/projects/${params.projectId}/jobs/${params.jobId}/workspace`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as { message?: string; workspace?: DashboardData };
      if (!response.ok || !payload.workspace) {
        setStatus(payload.message ?? "Could not load job workspace.");
        return;
      }
      setWorkspace(payload.workspace);
      setStatus("");
    })();
  }, [params.jobId, params.projectId]);

  if (!workspace) {
    return (
      <AppShell title="Job Workspace">
        <section className="card">{status}</section>
      </AppShell>
    );
  }

  const base = `/projects/${params.projectId}`;
  const jobQuery = `jobId=${encodeURIComponent(params.jobId)}`;
  const scanComplete = searchParams.get("scanComplete") === "1";
  const takeoffTotals = workspace.takeoffs.reduce(
    (acc, item) => ({
      lights: acc.lights + item.counts.light + item.counts.recessed_light + item.counts.fan,
      receptacles: acc.receptacles + item.counts.outlet,
      switches: acc.switches + item.counts.switch
    }),
    { lights: 0, receptacles: 0, switches: 0 }
  );

  return (
    <AppShell title="Job Workspace">
      {scanComplete && (
        <section className="card">
          <h3>Scan Complete</h3>
          <p>Lighting Fixtures: {takeoffTotals.lights}</p>
          <p>Receptacles: {takeoffTotals.receptacles}</p>
          <p>Switches: {takeoffTotals.switches}</p>
          <div className="row actions">
            <Link className="button-link" href={`${base}/takeoff?${jobQuery}`}>
              View Takeoff Results
            </Link>
          </div>
        </section>
      )}
      <section className="card">
        <h3>{workspace.project.name}</h3>
        <p className="muted">Job ID: {params.jobId}</p>
        <div className="row actions">
          <Link className="button-link secondary" href={`/projects/${params.projectId}`}>
            Back to Project Dashboard
          </Link>
          <Link className="button-link secondary" href={`/projects/${params.projectId}#jobs`}>
            Back to Jobs
          </Link>
          <Link className="button-link" href="/projects">
            Back to Projects
          </Link>
        </div>
      </section>

      <section className="card section-gap">
        <h3>Workflow</h3>
        <div className="row actions">
          <Link className="button-link" href={`${base}/import?${jobQuery}`}>
            Plans
          </Link>
          <Link className="button-link secondary" href={`${base}/takeoff?${jobQuery}`}>
            Takeoffs
          </Link>
          <Link className="button-link secondary" href={`${base}/estimate?${jobQuery}`}>
            Estimates
          </Link>
          <Link className="button-link secondary" href={`${base}/panel-schedule?${jobQuery}`}>
            Load Calculations
          </Link>
          <Link className="button-link secondary" href={`${base}/service-design?${jobQuery}`}>
            Compliance
          </Link>
          <Link className="button-link secondary" href={`${base}/export?${jobQuery}`}>
            Reports
          </Link>
        </div>
      </section>

      <section className="card section-gap">
        <h3>Workspace Summary</h3>
        <ul>
          <li>Plans: {workspace.sheets.length}</li>
          <li>Rooms: {workspace.rooms.length}</li>
          <li>Symbols: {workspace.symbols.length}</li>
          <li>Takeoffs: {workspace.takeoffs.length}</li>
          <li>Reports: {workspace.exports.length}</li>
        </ul>
      </section>
    </AppShell>
  );
}
