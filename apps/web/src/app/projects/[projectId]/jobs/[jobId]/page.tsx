"use client";

import type { DashboardData } from "@package/types";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../../../../components/app-shell";

function formatWorkflowCount(label: string, value: number) {
  return { label, value };
}

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
  const workflowSummary = [
    formatWorkflowCount("Plans", workspace.sheets.length),
    formatWorkflowCount("Rooms", workspace.rooms.length),
    formatWorkflowCount("Symbols", workspace.symbols.length),
    formatWorkflowCount("Takeoffs", workspace.takeoffs.length),
    formatWorkflowCount("Reports", workspace.exports.length)
  ];
  const workflowLinks = [
    { label: "Plans", href: `${base}/import?${jobQuery}`, tag: "AI", tone: "" },
    { label: "Takeoffs", href: `${base}/takeoff?${jobQuery}`, tag: "TO", tone: "secondary" },
    { label: "Estimates", href: `${base}/estimate?${jobQuery}`, tag: "EST", tone: "secondary" },
    { label: "Load Calculations", href: `${base}/panel-schedule?${jobQuery}`, tag: "LC", tone: "secondary" },
    { label: "Compliance", href: `${base}/service-design?${jobQuery}`, tag: "CMP", tone: "secondary" },
    { label: "Reports", href: `${base}/export?${jobQuery}`, tag: "RPT", tone: "secondary" }
  ];

  return (
    <AppShell title="Job Workspace">
      {scanComplete && (
        <section className="card card-accent">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Scan result</p>
              <h3>Scan Complete</h3>
            </div>
            <span className="subtle-badge">Ready for takeoff review</span>
          </div>
          <div className="entity-meta-grid">
            <div className="entity-meta-item">
              <span className="entity-meta-label">Lighting Fixtures</span>
              <strong>{takeoffTotals.lights}</strong>
            </div>
            <div className="entity-meta-item">
              <span className="entity-meta-label">Receptacles</span>
              <strong>{takeoffTotals.receptacles}</strong>
            </div>
            <div className="entity-meta-item">
              <span className="entity-meta-label">Switches</span>
              <strong>{takeoffTotals.switches}</strong>
            </div>
          </div>
          <div className="row actions">
            <Link className="button-link" href={`${base}/takeoff?${jobQuery}`}>
              View Takeoff Results
            </Link>
          </div>
        </section>
      )}

      <section className="hero-panel section-gap">
        <div>
          <p className="section-kicker">Job workspace</p>
          <h2>{workspace.project.name}</h2>
          <p className="muted">Job ID: {params.jobId}</p>
          <p className="muted">Use this workspace to move from plan import to takeoff, estimating, compliance, and reports without mixing scopes.</p>
        </div>
        <div className="hero-stats">
          {workflowSummary.slice(0, 3).map((item) => (
            <div key={item.label} className="hero-stat">
              <span className="hero-stat-label">{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="card section-gap">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Navigation</p>
            <h3>Return paths</h3>
          </div>
          <span className="subtle-badge">Jump between project and job views</span>
        </div>
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
        <div className="section-heading">
          <div>
            <p className="section-kicker">Workflow</p>
            <h3>Estimator actions</h3>
          </div>
          <span className="subtle-badge">Each step keeps this job selected</span>
        </div>
        <div className="tool-grid">
          {workflowLinks.map((item) => (
            <Link
              key={item.href}
              className={item.tone === "secondary" ? "tool-tile" : "tool-tile blue"}
              href={item.href}
            >
              <p className="section-kicker">{item.tag}</p>
              <h4>{item.label}</h4>
              <p>Open the {item.label.toLowerCase()} workspace for this active job.</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="card section-gap">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Workspace summary</p>
            <h3>Current job totals</h3>
          </div>
        </div>
        <div className="entity-grid">
          {workflowSummary.map((item) => (
            <article key={item.label} className="entity-card compact-card">
              <p className="entity-eyebrow">{item.label}</p>
              <h4>{item.value}</h4>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
