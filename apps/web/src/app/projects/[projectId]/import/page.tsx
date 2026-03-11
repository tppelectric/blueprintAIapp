"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../../../components/app-shell";

const SOURCES = [
  { value: "local", label: "Local Upload" },
  { value: "onedrive", label: "OneDrive" },
  { value: "google-drive", label: "Google Drive" },
  { value: "apple-files", label: "Apple Files" }
] as const;

const SCAN_MODES = [
  { value: "mock", label: "Mock (fast testing)" },
  { value: "real", label: "Real PDF/OCR" }
] as const;

const PROGRESS_MODES = [
  { value: "panel", label: "Same Page Progress Panel" },
  { value: "page", label: "Dedicated Scan Progress Page" }
] as const;

type ScanJobStatus =
  | "queued"
  | "processing"
  | "analyzing_symbols"
  | "grouping_devices"
  | "generating_takeoff"
  | "completed"
  | "failed";

type PageProgressItem = {
  sheetNumber: string;
  title: string;
  pageNumber: number;
  status: "queued" | "processing" | "completed" | "failed";
  progressPercent: number;
  currentStep: string;
};

type ScanProgressState = {
  status: ScanJobStatus;
  currentStep: string;
  progressPercent: number;
  errorMessage?: string | null;
  aiSecondPass: boolean;
  aiSecondPassStatus: "idle" | "running" | "completed" | "skipped";
  pageProgress: PageProgressItem[];
};

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const slice = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export default function ImportPlansPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId") ?? undefined;
  const [source, setSource] = useState<(typeof SOURCES)[number]["value"]>("local");
  const [scanMode, setScanMode] = useState<(typeof SCAN_MODES)[number]["value"]>("real");
  const [fileName, setFileName] = useState("hudson-ridge-electrical.pdf");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [manualScale, setManualScale] = useState("");
  const [aiSecondPass, setAiSecondPass] = useState(false);
  const [progressMode, setProgressMode] = useState<(typeof PROGRESS_MODES)[number]["value"]>("panel");
  const [takeoffPrompt, setTakeoffPrompt] = useState<"none" | "prompt">("none");
  const [scanPassCompleted, setScanPassCompleted] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [scanJobId, setScanJobId] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgressState | null>(null);
  const [takeoffSummary, setTakeoffSummary] = useState<{
    lightingFixtures: number;
    receptacles: number;
    switches: number;
  } | null>(null);

  useEffect(() => {
    if (!scanJobId || progressMode !== "panel") {
      return;
    }

    let cancelled = false;
    const loadScanProgress = async () => {
      try {
        const response = await fetch(`/api/projects/${params.projectId}/scan-jobs/${scanJobId}`, { cache: "no-store" });
        const payload = (await response.json()) as {
          message?: string;
          scanJob?: ScanProgressState;
        };
        if (cancelled || !response.ok || !payload.scanJob) {
          return;
        }

        setScanProgress(payload.scanJob);

        if (payload.scanJob.status === "completed") {
          clearInterval(interval);
          setScanPassCompleted(true);
          setTakeoffPrompt("prompt");
          setStatus("Scan complete.");

          const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
          const takeoffResponse = await fetch(`/api/projects/${params.projectId}/takeoff${query}`, { cache: "no-store" });
          const takeoffPayload = (await takeoffResponse.json()) as {
            takeoffs?: Array<{ counts: { light: number; recessed_light: number; fan: number; outlet: number; switch: number } }>;
          };
          if (takeoffResponse.ok && takeoffPayload.takeoffs) {
            const summary = takeoffPayload.takeoffs.reduce(
              (acc, item) => ({
                lightingFixtures: acc.lightingFixtures + item.counts.light + item.counts.recessed_light + item.counts.fan,
                receptacles: acc.receptacles + item.counts.outlet,
                switches: acc.switches + item.counts.switch
              }),
              { lightingFixtures: 0, receptacles: 0, switches: 0 }
            );
            setTakeoffSummary(summary);
          }
          router.refresh();
        } else if (payload.scanJob.status === "failed") {
          clearInterval(interval);
          setScanPassCompleted(false);
          setStatus(payload.scanJob.errorMessage ?? "Scan failed. Unable to process plan file.");
        }
      } catch {
        if (!cancelled) {
          setStatus("Could not refresh scan progress.");
        }
      }
    };

    void loadScanProgress();
    const interval = setInterval(() => {
      void loadScanProgress();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId, params.projectId, progressMode, router, scanJobId]);

  async function startScanJob(options: { useUpload: boolean }) {
    setStatus("Creating scan job...");
    setTakeoffSummary(null);
    setScanPassCompleted(false);

    let upload: { fileName: string; contentType: string; contentBase64: string } | undefined;
    if (options.useUpload) {
      if (selectedFiles.length === 0) {
        setStatus("Select a local plan file before starting import and scan.");
        return;
      }
      const file = selectedFiles[0];
      upload = {
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        contentBase64: await fileToBase64(file)
      };
    }

    const response = await fetch(`/api/projects/${params.projectId}/scan-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        source,
        fileName: upload ? undefined : fileName.trim() || undefined,
        upload,
        scanMode,
        manualScale: manualScale.trim() || undefined,
        aiSecondPass
      })
    });

    const payload = (await response.json()) as {
      message?: string;
      scanJob?: {
        id: string;
        status: ScanJobStatus;
        currentStep: string;
        progressPercent: number;
        aiSecondPass?: boolean;
      };
    };

    if (!response.ok || !payload.scanJob) {
      setStatus(payload.message ?? "Could not start scan job.");
      return;
    }

    setScanJobId(payload.scanJob.id);
    setScanProgress({
      status: payload.scanJob.status,
      currentStep: payload.scanJob.currentStep,
      progressPercent: payload.scanJob.progressPercent,
      aiSecondPass: payload.scanJob.aiSecondPass ?? aiSecondPass,
      aiSecondPassStatus: aiSecondPass ? "running" : "skipped",
      pageProgress: []
    });
    setStatus(options.useUpload ? "Import and scan job started." : "Scan job started.");
    setTakeoffPrompt("prompt");

    if (progressMode === "page") {
      const query = new URLSearchParams();
      query.set("scanJobId", payload.scanJob.id);
      if (jobId) {
        query.set("jobId", jobId);
      }
      router.push(`/projects/${params.projectId}/scan-progress?${query.toString()}`);
    }
  }

  return (
    <AppShell title="Import Plans">
      <section className="card">
        <h3>Plan Sources</h3>
        <p className="muted">Imports run sheet split and extraction on each sheet, and can optionally run an AI second pass for uncertain symbols.</p>
        {jobId && <p className="muted">Active Job: {jobId}</p>}

        <div className="form-grid">
          <label className="field">
            Source
            <select value={source} onChange={(event) => setSource(event.target.value as (typeof SOURCES)[number]["value"])}>
              {SOURCES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Scan Mode
            <select value={scanMode} onChange={(event) => setScanMode(event.target.value as (typeof SCAN_MODES)[number]["value"])}>
              {SCAN_MODES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            File Name
            <input value={fileName} onChange={(event) => setFileName(event.target.value)} />
          </label>

          <label className="field">
            Manual Scale (used if AI cannot detect)
            <input
              value={manualScale}
              onChange={(event) => setManualScale(event.target.value)}
              placeholder={`Example: 1/4" = 1'-0"`}
            />
          </label>

          <label className="field">
            Scan Progress Display
            <select value={progressMode} onChange={(event) => setProgressMode(event.target.value as (typeof PROGRESS_MODES)[number]["value"])}>
              {PROGRESS_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            AI Second Pass
            <select value={aiSecondPass ? "enabled" : "disabled"} onChange={(event) => setAiSecondPass(event.target.value === "enabled")}>
              <option value="disabled">Off</option>
              <option value="enabled">On for uncertain symbols</option>
            </select>
          </label>

          {source === "local" && (
            <label className="field">
              Local Plan File
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
              />
            </label>
          )}

          <div className="row actions">
            <button type="button" onClick={() => void startScanJob({ useUpload: source === "local" })}>
              Import And Scan
            </button>
            <button type="button" className="secondary" onClick={() => void startScanJob({ useUpload: false })}>
              Scan Plans
            </button>
          </div>
        </div>

        {status && <p className="status-text">{status}</p>}

        {scanProgress && progressMode === "panel" && (
          <div className="card section-gap progress-panel">
            <div className="progress-header">
              <div>
                <p className="entity-eyebrow">Scanning Plans</p>
                <h3>{scanProgress.currentStep}</h3>
                <p className="muted">Project: {params.projectId}{jobId ? ` | Job: ${jobId}` : ""}</p>
              </div>
              <div className="progress-meta">
                <span className={`status-pill ${scanProgress.status === "completed" ? "completed" : scanProgress.status === "failed" ? "failed" : "processing"}`}>
                  {scanProgress.status === "completed" ? "Complete" : scanProgress.status === "failed" ? "Failed" : "In Progress"}
                </span>
                <span className="status-pill">{scanProgress.progressPercent}% complete</span>
                <span className={`status-pill ${scanProgress.aiSecondPass ? (scanProgress.aiSecondPassStatus === "completed" ? "completed" : "processing") : ""}`}>
                  AI second pass:{" "}
                  {scanProgress.aiSecondPass
                    ? scanProgress.aiSecondPassStatus === "completed"
                      ? "Completed"
                      : "Running"
                    : "Off"}
                </span>
              </div>
            </div>

            <div className="progress-bar" aria-label="Overall scan progress">
              <div
                className={`progress-bar-fill ${scanProgress.status === "failed" ? "failed" : ""}`}
                style={{ width: `${Math.max(0, Math.min(100, scanProgress.progressPercent))}%` }}
              />
            </div>

            {scanProgress.pageProgress.length > 0 && (
              <div className="section-gap progress-stack">
                <div>
                  <p className="entity-eyebrow">Per-Page Progress</p>
                  <h4>Each uploaded page shows its own scan bar.</h4>
                </div>
                <div className="page-progress-grid">
                  {scanProgress.pageProgress.map((page) => (
                    <article key={`${page.sheetNumber}-${page.pageNumber}`} className="page-progress-card">
                      <div className="page-progress-top">
                        <div className="page-progress-copy">
                          <p className="entity-eyebrow">
                            {page.sheetNumber} | Page {page.pageNumber}
                          </p>
                          <h4>{page.title || "Untitled sheet"}</h4>
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

            {scanProgress.status === "failed" && (
              <p className="status-text">Scan Failed. {scanProgress.errorMessage ?? "Unable to process plan file."}</p>
            )}
            {scanProgress.status === "completed" && <p className="status-text">Scan Complete</p>}
            {scanProgress.status === "completed" && (
              <div className="row actions">
                <button
                  type="button"
                  onClick={() => {
                    const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
                    router.push(`/projects/${params.projectId}/takeoff${query}`);
                  }}
                >
                  View Results
                </button>
              </div>
            )}
          </div>
        )}

        {takeoffSummary && (
          <div className="card section-gap">
            <h3>Takeoff Summary</h3>
            <p>Lighting Fixtures: {takeoffSummary.lightingFixtures}</p>
            <p>Receptacles: {takeoffSummary.receptacles}</p>
            <p>Switches: {takeoffSummary.switches}</p>
          </div>
        )}

        {takeoffPrompt === "prompt" && (
          <div className="card section-gap">
            <h3>Do you want to start a takeoff?</h3>
            <div className="row actions">
              <button
                type="button"
                disabled={!scanPassCompleted}
                onClick={() => {
                  if (!scanPassCompleted) {
                    return;
                  }
                  const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
                  router.push(`/projects/${params.projectId}/takeoff${query}`);
                }}
              >
                Start Takeoff
              </button>
              <button type="button" className="secondary" onClick={() => setTakeoffPrompt("none")}>
                Import Plans Only
              </button>
            </div>
            {!scanPassCompleted && (
              <p className="muted section-gap">
                Run a successful scan first using <strong>Import And Scan</strong> or <strong>Scan Plans</strong>.
              </p>
            )}
          </div>
        )}
      </section>
    </AppShell>
  );
}
