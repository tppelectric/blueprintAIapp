"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../../../../components/app-shell";

type ScanJobStatus =
  | "queued"
  | "processing"
  | "analyzing_symbols"
  | "grouping_devices"
  | "generating_takeoff"
  | "completed"
  | "failed";

type PageProgressItem = {
  id: string;
  sourceFileName: string;
  sheetNumber: string;
  title: string;
  pageNumber: number;
  status: "queued" | "processing" | "completed" | "failed";
  progressPercent: number;
  currentStep: string;
};

type ScanJobPayload = {
  status: ScanJobStatus;
  currentStep: string;
  progressPercent: number;
  errorMessage?: string | null;
  aiSecondPass?: boolean;
  aiSecondPassStatus?: "idle" | "running" | "completed" | "skipped";
  pageProgress?: PageProgressItem[];
};

const STEP_LABELS: Array<{ key: ScanJobStatus; label: string }> = [
  { key: "processing", label: "Step 1: Loading plans" },
  { key: "analyzing_symbols", label: "Step 2: Detecting electrical symbols" },
  { key: "grouping_devices", label: "Step 3: Grouping devices by room" },
  { key: "generating_takeoff", label: "Step 4: Generating takeoff" }
];

export default function ScanProgressPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const scanJobId = searchParams.get("scanJobId") ?? "";
  const jobId = searchParams.get("jobId");
  const [progress, setProgress] = useState<ScanJobPayload | null>(null);
  const [status, setStatus] = useState("Loading scan progress...");

  const resultsPath = useMemo(() => {
    const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
    return `/projects/${params.projectId}/takeoff${query}`;
  }, [jobId, params.projectId]);

  const workspacePath = useMemo(() => {
    if (jobId) {
      return `/projects/${params.projectId}/jobs/${jobId}`;
    }
    return `/projects/${params.projectId}`;
  }, [jobId, params.projectId]);

  useEffect(() => {
    if (!scanJobId) {
      setStatus("Missing scan job ID.");
      return;
    }

    let cancelled = false;
    const loadProgress = async () => {
      try {
        const response = await fetch(`/api/projects/${params.projectId}/scan-jobs/${scanJobId}`, { cache: "no-store" });
        const payload = (await response.json()) as {
          message?: string;
          scanJob?: ScanJobPayload;
        };

        if (cancelled) {
          return;
        }
        if (!response.ok || !payload.scanJob) {
          setStatus(payload.message ?? "Could not load scan progress.");
          return;
        }

        setProgress(payload.scanJob);
        setStatus("");

        if (payload.scanJob.status === "completed") {
          setStatus("Scan Complete");
          clearInterval(interval);
        }
        if (payload.scanJob.status === "failed") {
          setStatus(payload.scanJob.errorMessage ?? "Scan Failed. Unable to process plan file.");
          clearInterval(interval);
        }
      } catch {
        if (!cancelled) {
          setStatus("Could not load scan progress.");
        }
      }
    };

    void loadProgress();
    const interval = setInterval(() => {
      void loadProgress();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [params.projectId, scanJobId]);

  return (
    <AppShell title="Plan Scan Progress">
      <section className="card">
        <h3>Plan Scan Progress</h3>
        <p className="muted">Project: {params.projectId}{jobId ? ` | Job: ${jobId}` : ""}</p>
        <p className="muted">Scan Job: {scanJobId || "N/A"}</p>
        {status && <p className="status-text">{status}</p>}
      </section>

      {progress && (
        <section className="card section-gap progress-panel">
          <div className="progress-header">
            <div>
              <p className="entity-eyebrow">Scan Workflow</p>
              <h3>{progress.currentStep}</h3>
              <p className="muted">Overall progress for the uploaded plan set.</p>
            </div>
            <div className="progress-meta">
              <span className={`status-pill ${progress.status === "completed" ? "completed" : progress.status === "failed" ? "failed" : "processing"}`}>
                {progress.status === "completed" ? "Complete" : progress.status === "failed" ? "Failed" : "In Progress"}
              </span>
              <span className="status-pill">{progress.progressPercent}% complete</span>
              <span className={`status-pill ${progress.aiSecondPass ? (progress.aiSecondPassStatus === "completed" ? "completed" : "processing") : ""}`}>
                AI second pass:{" "}
                {progress.aiSecondPass
                  ? progress.aiSecondPassStatus === "completed"
                    ? "Completed"
                    : "Running"
                  : "Off"}
              </span>
            </div>
          </div>

          <div className="progress-bar" aria-label="Overall scan progress">
            <div
              className={`progress-bar-fill ${progress.status === "failed" ? "failed" : ""}`}
              style={{ width: `${Math.max(0, Math.min(100, progress.progressPercent))}%` }}
            />
          </div>

          <div className="section-gap">
            {STEP_LABELS.map((step) => (
              <p key={step.key} className="muted">
                {step.label}
              </p>
            ))}
          </div>

          {(progress.pageProgress ?? []).length > 0 && (
            <div className="section-gap progress-stack">
              <div>
                <p className="entity-eyebrow">Per-Page Progress</p>
                <h4>Each uploaded sheet shows its own scan status.</h4>
              </div>
              <div className="page-progress-grid">
                {(progress.pageProgress ?? []).map((page) => (
                  <article key={page.id} className="page-progress-card">
                    <div className="page-progress-top">
                      <div className="page-progress-copy">
                        <p className="entity-eyebrow">
                          {page.sheetNumber} | Page {page.pageNumber}
                        </p>
                        <h4>{page.title || "Untitled sheet"}</h4>
                        <p className="muted">{page.sourceFileName}</p>
                        <p className="muted">{page.currentStep}</p>
                      </div>
                      <span
                        className={`status-pill ${page.status === "completed" ? "completed" : page.status === "failed" ? "failed" : "processing"}`}
                      >
                        {page.status === "completed" ? "Complete" : page.status === "failed" ? "Failed" : "Scanning"}
                      </span>
                    </div>
                    <div className="page-progress-detail">
                      <span className="muted">Page progress</span>
                      <strong>{page.progressPercent}%</strong>
                    </div>
                    <div className="progress-bar" aria-label={`${page.sheetNumber} progress`}>
                      <div
                        className={`progress-bar-fill ${page.status === "failed" ? "failed" : ""}`}
                        style={{ width: `${Math.max(0, Math.min(100, page.progressPercent))}%` }}
                      />
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {progress.status === "completed" && (
            <div className="row actions">
              <button type="button" onClick={() => router.push(resultsPath)}>
                View Results
              </button>
              <button type="button" className="secondary" onClick={() => router.push(workspacePath)}>
                Return to Workspace
              </button>
            </div>
          )}

          {progress.status === "failed" && (
            <div className="row actions">
              <button type="button" onClick={() => router.refresh()}>
                Retry Status Check
              </button>
              <button type="button" className="secondary" onClick={() => router.push(workspacePath)}>
                Return to Job Workspace
              </button>
            </div>
          )}
        </section>
      )}
    </AppShell>
  );
}
