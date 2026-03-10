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

export default function ImportPlansPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId") ?? undefined;
  const [source, setSource] = useState<(typeof SOURCES)[number]["value"]>("local");
  const [scanMode, setScanMode] = useState<(typeof SCAN_MODES)[number]["value"]>("mock");
  const [fileName, setFileName] = useState("hudson-ridge-electrical.pdf");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [manualScale, setManualScale] = useState("");
  const [progressMode, setProgressMode] = useState<(typeof PROGRESS_MODES)[number]["value"]>("panel");
  const [takeoffPrompt, setTakeoffPrompt] = useState<"none" | "prompt">("none");
  const [scanPassCompleted, setScanPassCompleted] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [scanJobId, setScanJobId] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<{
    status: ScanJobStatus;
    currentStep: string;
    progressPercent: number;
    errorMessage?: string | null;
  } | null>(null);
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
    const interval = setInterval(() => {
      void (async () => {
        const response = await fetch(`/api/projects/${params.projectId}/scan-jobs/${scanJobId}`, { cache: "no-store" });
        const payload = (await response.json()) as {
          message?: string;
          scanJob?: {
            status: ScanJobStatus;
            currentStep: string;
            progressPercent: number;
            errorMessage?: string | null;
          };
        };
        if (cancelled || !response.ok || !payload.scanJob) {
          return;
        }

        setScanProgress({
          status: payload.scanJob.status,
          currentStep: payload.scanJob.currentStep,
          progressPercent: payload.scanJob.progressPercent,
          errorMessage: payload.scanJob.errorMessage ?? null
        });

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
      })();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId, params.projectId, progressMode, router, scanJobId]);

  async function handleImport() {
    setStatus("Importing and scanning sheets...");
    let response: Response;
    if (source === "local" && selectedFiles.length > 0) {
      const form = new FormData();
      form.append("projectId", params.projectId);
      if (jobId) {
        form.append("jobId", jobId);
      }
      form.append("source", source);
      form.append("scanMode", scanMode);
      if (manualScale.trim()) {
        form.append("manualScale", manualScale.trim());
      }
      form.append("fileName", selectedFiles[0].name);
      for (const file of selectedFiles) {
        form.append("files", file);
      }
      response = await fetch("/api/projects/imports/plans", {
        method: "POST",
        body: form
      });
    } else {
      response = await fetch("/api/projects/imports/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: params.projectId,
          jobId,
          source,
          scanMode,
          manualScale: manualScale.trim() || undefined,
          fileName
        })
      });
    }

    const payload = (await response.json()) as {
      message?: string;
      dashboard?: {
        rooms?: Array<unknown>;
        symbols?: Array<unknown>;
      };
      scanner?: {
        status: string;
        mode: string;
        message?: string;
        scaleSummary?: Array<{ sheetNumber: string; pageNumber: number; detectedScale: string | null; needsInput: boolean }>;
      };
      uploadedFilePath?: string;
      uploadedFilePaths?: string[];
      importedFiles?: number;
    };

    if (!response.ok) {
      setStatus(payload.message ?? "Import failed");
      setScanPassCompleted(false);
      return;
    }

    const scaleNeedsInput = (payload.scanner?.scaleSummary ?? []).filter((item) => item.needsInput).length;
    if (payload.scanner?.status === "processed") {
      setScanPassCompleted(true);
      const fileCount = payload.importedFiles ?? payload.uploadedFilePaths?.length ?? 1;
      const roomCount = payload.dashboard?.rooms?.length ?? 0;
      const symbolCount = payload.dashboard?.symbols?.length ?? 0;
      const scaleText =
        scaleNeedsInput > 0
          ? ` Scale was not detected on ${scaleNeedsInput} sheet(s); enter scale and re-run import, or run with Manual Scale.`
          : " Scale detected or provided for all processed sheets.";
      setStatus(
        `Import complete (${fileCount} file(s)). Scanner processed in ${payload.scanner.mode} mode and found ${roomCount} room(s) / ${symbolCount} symbol(s).${scaleText}`
      );
    } else if (payload.scanner?.status === "fallback") {
      setScanPassCompleted(false);
      setStatus(payload.scanner.message ?? "Scanner unavailable. Fallback import used.");
    } else {
      setScanPassCompleted(false);
      setStatus("Import complete.");
    }

    if (payload.uploadedFilePath) {
      setFileName(payload.uploadedFilePath);
    } else if (payload.uploadedFilePaths && payload.uploadedFilePaths.length > 0) {
      setFileName(payload.uploadedFilePaths[payload.uploadedFilePaths.length - 1]);
    }

    setTakeoffPrompt("prompt");
    router.refresh();
  }

  async function handleScanPlans() {
    setStatus("Creating scan job...");
    setTakeoffSummary(null);
    const response = await fetch(`/api/projects/${params.projectId}/scan-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        source,
        fileName: fileName.trim() || undefined,
        scanMode,
        manualScale: manualScale.trim() || undefined
      })
    });

    const payload = (await response.json()) as {
      message?: string;
      scanJob?: {
        id: string;
        status: ScanJobStatus;
        currentStep: string;
        progressPercent: number;
      };
    };

    if (!response.ok || !payload.scanJob) {
      setStatus(payload.message ?? "Could not start scan job.");
      setScanPassCompleted(false);
      return;
    }

    setScanJobId(payload.scanJob.id);
    setScanProgress({
      status: payload.scanJob.status,
      currentStep: payload.scanJob.currentStep,
      progressPercent: payload.scanJob.progressPercent
    });
    setStatus("Scan job started.");

    if (progressMode === "page") {
      const query = new URLSearchParams();
      query.set("scanJobId", payload.scanJob.id);
      if (jobId) {
        query.set("jobId", jobId);
      }
      router.push(`/projects/${params.projectId}/scan-progress?${query.toString()}`);
      return;
    }
  }

  return (
    <AppShell title="Import Plans">
      <section className="card">
        <h3>Plan Sources</h3>
        <p className="muted">Imports automatically run sheet split and extraction on each sheet.</p>
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

          {source === "local" && (
            <label className="field">
              Local Plan Files (PDF/PNG/JPG, multi-file allowed)
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                multiple
                onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
              />
            </label>
          )}

          <div className="row actions">
            <button type="button" onClick={handleImport}>
              Import And Scan
            </button>
            <button type="button" className="secondary" onClick={handleScanPlans}>
              Scan Plans (AI Pass)
            </button>
          </div>
        </div>

        {status && <p className="status-text">{status}</p>}

        {scanProgress && progressMode === "panel" && (
          <div className="card section-gap">
            <h3>Scanning Plans...</h3>
            <p className="muted">Project: {params.projectId}{jobId ? ` | Job: ${jobId}` : ""}</p>
            <p>
              Step: <strong>{scanProgress.currentStep}</strong>
            </p>
            <p>
              Progress: <strong>{scanProgress.progressPercent}%</strong>
            </p>
            <div style={{ width: "100%", height: 12, borderRadius: 999, background: "#d9e6f3", overflow: "hidden" }}>
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, scanProgress.progressPercent))}%`,
                  height: "100%",
                  background: scanProgress.status === "failed" ? "#b24a1b" : "#0f5fa8",
                  transition: "width 0.3s ease"
                }}
              />
            </div>
            {scanProgress.status === "failed" && (
              <p className="status-text">Scan Failed. {scanProgress.errorMessage ?? "Unable to process plan file."}</p>
            )}
            {scanProgress.status === "completed" && <p className="status-text">Scan Complete</p>}
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
                Run a successful scan first using <strong>Import And Scan</strong> or <strong>Scan Plans (AI Pass)</strong>.
              </p>
            )}
          </div>
        )}
      </section>
    </AppShell>
  );
}
