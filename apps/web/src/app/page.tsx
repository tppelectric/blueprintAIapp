"use client";

import type {
  BlueprintProcessingRunSummary,
  DashboardData,
  PlatformDashboard,
  Project
} from "@package/types";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { StatCard } from "../components/stat-card";
import { formatCount, formatDate } from "../lib/format";

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [platform, setPlatform] = useState<PlatformDashboard | null>(null);
  const [runs, setRuns] = useState<BlueprintProcessingRunSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("p-001");
  const [status, setStatus] = useState("Loading dashboard...");

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const loadDashboard = async (attempt: number) => {
      try {
        const projectListResp = await fetch("/api/projects", { cache: "no-store" });
        const projectListPayload = (await projectListResp.json()) as { projects?: Project[]; message?: string };
        const selectedProjectId = projectListPayload.projects?.[0]?.id ?? "p-001";

        if (cancelled) {
          return;
        }

        setActiveProjectId(selectedProjectId);

        const [projectResp, platformResp, runsResp] = await Promise.all([
          fetch(`/api/projects/${selectedProjectId}/dashboard`, { cache: "no-store" }),
          fetch("/api/platform/dashboard", { cache: "no-store" }),
          fetch(`/api/projects/${selectedProjectId}/blueprint-processing-runs`, { cache: "no-store" })
        ]);

        const projectPayload = (await projectResp.json()) as { message?: string; dashboard?: DashboardData };
        const platformPayload = (await platformResp.json()) as { message?: string; dashboard?: PlatformDashboard };
        const runsPayload = (await runsResp.json()) as {
          message?: string;
          runs?: BlueprintProcessingRunSummary[];
        };

        if (cancelled) {
          return;
        }

        if (!projectResp.ok || !projectPayload.dashboard) {
          setStatus(projectPayload.message ?? "Could not load project dashboard.");
          return;
        }

        if (!platformResp.ok || !platformPayload.dashboard) {
          setStatus(platformPayload.message ?? "Could not load platform dashboard.");
          return;
        }

        if (runsResp.ok && runsPayload.runs) {
          setRuns(runsPayload.runs);
        }

        setDashboard(projectPayload.dashboard);
        setPlatform(platformPayload.dashboard);
        setStatus("");
      } catch (error) {
        if (cancelled) {
          return;
        }

        const isStartupRetry = attempt < 5;
        if (isStartupRetry) {
          setStatus("Starting app services... retrying dashboard connection.");
          retryTimer = setTimeout(() => {
            void loadDashboard(attempt + 1);
          }, 2000);
          return;
        }

        setStatus((error as Error).message || "Network error while loading dashboard.");
      }
    };

    void loadDashboard(0);

    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, []);

  if (!dashboard || !platform) {
    return (
      <AppShell title="Project Dashboard">
        <section className="card">{status}</section>
      </AppShell>
    );
  }

  const reviewCount = dashboard.symbols.filter((item) => item.needsReview).length;
  const scopeNotes = dashboard.notes.filter((item) => item.impactsScope).length;

  return (
    <AppShell title="Project Dashboard">
      <section className="hero-panel">
        <div>
          <p className="section-kicker">Live operations</p>
          <h2>Estimator command view for active blueprint work</h2>
          <p className="muted">
            Monitor scanned sheets, review load and material pressure, and jump straight into project actions without
            hunting through screens.
          </p>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hero-stat-label">Active Project</span>
            <strong>{dashboard.project.name}</strong>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">Service Target</span>
            <strong>{platform.loadCalculation.recommendedServiceSize}</strong>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">Review Queue</span>
            <strong>{formatCount(reviewCount)}</strong>
          </div>
        </div>
      </section>

      <section className="grid stats section-gap">
        <StatCard label="Uploaded Plans" value={formatCount(dashboard.sheets.length)} />
        <StatCard label="Detected Rooms" value={formatCount(dashboard.rooms.length)} />
        <StatCard label="Detected Symbols" value={formatCount(dashboard.symbols.length)} />
        <StatCard label="Scope Notes" value={formatCount(scopeNotes)} tone={scopeNotes > 0 ? "warn" : "default"} />
        <StatCard label="Material Line Items" value={formatCount(dashboard.materials.length)} />
        <StatCard label="Review Queue" value={formatCount(reviewCount)} tone={reviewCount > 0 ? "warn" : "default"} />
      </section>

      <section className="card card-accent section-gap">
        <h3>ElectricalEstimator AI Snapshot</h3>
        <p className="muted">{platform.projectName}</p>
        <div className="grid stats">
          <StatCard label="Total Points" value={formatCount(platform.estimates.totalPoints)} />
          <StatCard label="Total Project Cost" value={`$${formatCount(platform.estimates.totalProjectCost)}`} />
          <StatCard label="Price / Sq Ft" value={`$${platform.estimates.pricePerSqFt}`} />
          <StatCard label="Recommended Service" value={platform.loadCalculation.recommendedServiceSize} />
        </div>
        <div className="row actions">
          <Link href="/platform" className="button-link">
            Open Platform Dashboard
          </Link>
          <Link href="/platform/load-calculator" className="button-link secondary">
            Open Standalone Load Calculator
          </Link>
          <Link href="/platform/wifi-analyzer" className="button-link secondary">
            Open Standalone WiFi Analyzer
          </Link>
          <Link href="/platform/tools" className="button-link secondary">
            Open General Tools
          </Link>
        </div>
        <p className="muted section-gap">
          Load Calculator can run independently of project/job, then be assigned to a selected project/job from within the tool.
        </p>
      </section>

      <section className="card section-gap">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Pipeline visibility</p>
            <h3>Blueprint Processing History</h3>
          </div>
        </div>
        <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>File</th>
              <th>Mode</th>
              <th>Sheets</th>
              <th>Rooms</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr>
                <td colSpan={6}>No persisted blueprint runs yet.</td>
              </tr>
            )}
            {runs.map((run) => (
              <tr key={run.runId}>
                <td>{run.runId}</td>
                <td>{run.sourceFileName}</td>
                <td>{run.scanMode}</td>
                <td>{run.processedSheets}</td>
                <td>{run.detectedRoomsCount}</td>
                <td>{formatDate(run.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section className="card section-gap">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Current project</p>
            <h3>{dashboard.project.name}</h3>
          </div>
          <span className="subtle-badge">Customer facing estimate flow</span>
        </div>
        <p className="muted">
          {dashboard.project.customerName} | {dashboard.project.location}
        </p>
        <div className="row">
          <Link href={`/projects/${activeProjectId}/import`} className="button-link">
            Import Plans
          </Link>
          <Link href={`/projects/${activeProjectId}/symbol-review`} className="button-link secondary">
            Review Symbols
          </Link>
          <Link href={`/projects/${activeProjectId}/takeoff`} className="button-link secondary">
            View Takeoff
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
