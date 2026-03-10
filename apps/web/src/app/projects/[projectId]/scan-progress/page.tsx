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

type ScanJobPayload = {
  status: ScanJobStatus;
  currentStep: string;
  progressPercent: number;
  errorMessage?: string | null;
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
    const interval = setInterval(() => {
      void (async () => {
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
          setTimeout(() => {
            const query = jobId ? "?scanComplete=1" : "?scanComplete=1";
            router.push(`${workspacePath}${query}`);
          }, 900);
        }
        if (payload.scanJob.status === "failed") {
          setStatus(payload.scanJob.errorMessage ?? "Scan Failed. Unable to process plan file.");
          clearInterval(interval);
        }
      })();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId, params.projectId, router, scanJobId]);

  return (
    <AppShell title="Plan Scan Progress">
      <section className="card">
        <h3>Plan Scan Progress</h3>
        <p className="muted">Project: {params.projectId}{jobId ? ` | Job: ${jobId}` : ""}</p>
        <p className="muted">Scan Job: {scanJobId || "N/A"}</p>
        {status && <p className="status-text">{status}</p>}
      </section>

      {progress && (
        <section className="card section-gap">
          <p>
            Step: <strong>{progress.currentStep}</strong>
          </p>
          <p>
            Progress: <strong>{progress.progressPercent}%</strong>
          </p>
          <div style={{ width: "100%", height: 14, borderRadius: 999, background: "#d9e6f3", overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.max(0, Math.min(100, progress.progressPercent))}%`,
                height: "100%",
                background: progress.status === "failed" ? "#b24a1b" : "#0f5fa8",
                transition: "width 0.3s ease"
              }}
            />
          </div>
          <div className="section-gap">
            {STEP_LABELS.map((step) => (
              <p key={step.key} className="muted">
                {step.label}
              </p>
            ))}
          </div>
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
