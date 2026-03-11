"use client";

import type { DashboardData, ExportJob } from "@package/types";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../../../components/app-shell";
import { formatDate } from "../../../../lib/format";

export default function ExportPage() {
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  const router = useRouter();
  const [status, setStatus] = useState("Loading export jobs...");
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [busyAction, setBusyAction] = useState<"csv" | "jobtread" | null>(null);

  async function loadPageData() {
    try {
      const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
      const [exportsResponse, dashboardResponse] = await Promise.all([
        fetch(`/api/projects/${params.projectId}/exports${query}`, { cache: "no-store" }),
        fetch(`/api/projects/${params.projectId}/dashboard${query}`, { cache: "no-store" })
      ]);

      const exportsPayload = (await exportsResponse.json()) as { message?: string; exports?: ExportJob[] };
      const dashboardPayload = (await dashboardResponse.json()) as { message?: string; dashboard?: DashboardData };

      if (!exportsResponse.ok || !exportsPayload.exports) {
        setStatus(exportsPayload.message ?? "Could not load export jobs.");
        return;
      }
      if (!dashboardResponse.ok || !dashboardPayload.dashboard) {
        setStatus(dashboardPayload.message ?? "Could not load project report data.");
        return;
      }

      setJobs(exportsPayload.exports);
      setDashboard(dashboardPayload.dashboard);
      setStatus("");
    } catch (error) {
      setStatus((error as Error).message || "Network error while loading export jobs.");
    }
  }

  useEffect(() => {
    void loadPageData();
  }, [jobId, params.projectId]);

  async function runExport(action: "csv" | "jobtread") {
    const endpoint = action === "csv" ? "csv" : "jobtread-sync";
    setBusyAction(action);
    try {
      const response = await fetch(`/api/projects/${params.projectId}/exports/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId })
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setStatus(payload.message ?? "Export failed");
        return;
      }

      setStatus(action === "csv" ? "CSV export completed." : "JobTread sync queued.");
      await loadPageData();
      router.refresh();
    } catch (error) {
      setStatus((error as Error).message || "Network error while running export.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <AppShell title="JobTread Export">
      <section className="card">
        <h3>Budget Output Options</h3>
        <p className="muted">This release includes direct sync architecture and JobTread-compatible CSV generation flow.</p>
        <div className="row actions">
          <button type="button" onClick={() => void runExport("csv")} disabled={busyAction !== null}>
            {busyAction === "csv" ? "Generating CSV..." : "Generate JobTread CSV"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void runExport("jobtread")}
            disabled={busyAction !== null}
          >
            {busyAction === "jobtread" ? "Queueing Sync..." : "Queue Direct JobTread Sync"}
          </button>
        </div>
        {status && <p className="status-text">{status}</p>}
      </section>

      <section className="card section-gap">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Project plans</p>
            <h3>Uploaded Plans In This Project</h3>
          </div>
          <span className="subtle-badge">{dashboard?.sheets.length ?? 0} sheet(s)</span>
        </div>
        {!dashboard || dashboard.sheets.length === 0 ? (
          <div className="empty-state">
            <h4>No uploaded plans yet</h4>
            <p>Upload plans from the project dashboard or the import workspace to populate project reporting.</p>
          </div>
        ) : (
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Sheet</th>
                  <th>Title</th>
                  <th>Source File</th>
                  <th>Page</th>
                  <th>Scale</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.sheets.map((sheet) => (
                  <tr key={sheet.id}>
                    <td>{sheet.sheetNumber}</td>
                    <td>{sheet.title}</td>
                    <td>{sheet.fileName}</td>
                    <td>{sheet.pageNumber}</td>
                    <td>{sheet.scale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card section-gap">
        <h3>Export / Sync Status</h3>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Type</th>
                <th>Status</th>
                <th>Created</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={5}>No export jobs yet.</td>
                </tr>
              )}
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.id}</td>
                  <td>{job.type}</td>
                  <td>{job.status}</td>
                  <td>{formatDate(job.createdAt)}</td>
                  <td>{job.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
