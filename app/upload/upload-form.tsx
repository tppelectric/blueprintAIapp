"use client";

import { WideAppHeader } from "@/components/wide-app-header";
import { useCallback, useRef, useState } from "react";
import {
  insertProjectAndSheets,
  uploadPdfFileToStorage,
  type UploadedSheetPayload,
} from "@/lib/upload-blueprint";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

async function hasPdfMagic(file: File): Promise<boolean> {
  const buf = await file.slice(0, 5).arrayBuffer();
  const head = new Uint8Array(buf).subarray(0, 4);
  const s = new TextDecoder("latin1").decode(head);
  return s === "%PDF";
}

function isLikelyPdf(file: File): boolean {
  if (!file.name.toLowerCase().endsWith(".pdf")) return false;
  const t = file.type;
  if (!t) return true;
  return (
    t === "application/pdf" ||
    t === "application/octet-stream" ||
    t === "application/x-pdf"
  );
}

type FileStatus = "ready" | "uploading" | "complete";

type PendingFile = {
  localId: string;
  file: File;
  status: FileStatus;
};

function newLocalId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

export function UploadBlueprintForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragActive, setDragActive] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<string | null>(null);
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);
  const [sheetProgress, setSheetProgress] = useState(0);

  const resetInput = useCallback(() => {
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const addFiles = useCallback(async (list: FileList | File[]) => {
    setError(null);
    const arr = Array.from(list);
    const next: PendingFile[] = [];
    for (const file of arr) {
      if (!isLikelyPdf(file)) {
        setError(
          "Only PDF blueprint files are accepted. Skipped non-PDF files.",
        );
        continue;
      }
      const magicOk = await hasPdfMagic(file);
      if (!magicOk) {
        setError(
          "One or more files don’t look like valid PDFs. They were skipped.",
        );
        continue;
      }
      next.push({ localId: newLocalId(), file, status: "ready" });
    }
    if (next.length) {
      setPendingFiles((prev) => [...prev, ...next]);
    }
  }, []);

  const removeFile = useCallback((localId: string) => {
    setPendingFiles((prev) => prev.filter((p) => p.localId !== localId));
  }, []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files?.length) void addFiles(files);
      resetInput();
    },
    [addFiles, resetInput],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragActive(false);
      if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  }, []);

  const startUpload = useCallback(async () => {
    const name = projectName.trim();
    if (!name) {
      setError("Enter a project name for this job.");
      return;
    }
    if (pendingFiles.length === 0) {
      setError("Add at least one PDF sheet.");
      return;
    }

    setError(null);
    setUploading(true);
    const total = pendingFiles.length;
    const uploaded: UploadedSheetPayload[] = [];

    try {
      for (let i = 0; i < total; i++) {
        const pf = pendingFiles[i]!;
        setCurrentSheetIndex(i + 1);
        setUploadPhase(`Uploading sheet ${i + 1} of ${total}...`);
        setSheetProgress(0);

        setPendingFiles((prev) =>
          prev.map((p) =>
            p.localId === pf.localId ? { ...p, status: "uploading" } : p,
          ),
        );

        const payload = await uploadPdfFileToStorage(pf.file, (pct) => {
          setSheetProgress(pct);
        });
        uploaded.push(payload);

        setPendingFiles((prev) =>
          prev.map((p) =>
            p.localId === pf.localId ? { ...p, status: "complete" } : p,
          ),
        );
      }

      setUploadPhase("Saving project…");
      setSheetProgress(100);
      const { projectId } = await insertProjectAndSheets(name, uploaded);
      // Hard navigation so we always leave the upload screen (client router can
      // occasionally not switch when state updates race the transition).
      window.location.assign(`/project/${projectId}`);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong while saving your blueprint. Please try again.",
      );
      setPendingFiles((prev) =>
        prev.map((p) => (p.status === "uploading" ? { ...p, status: "ready" } : p)),
      );
    } finally {
      setUploading(false);
      setUploadPhase(null);
      setCurrentSheetIndex(0);
      setSheetProgress(0);
    }
  }, [pendingFiles, projectName]);

  const canInteract = !uploading;

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="upload" showTppSubtitle />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-12 sm:py-16">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Upload blueprint
          </h1>
          <p className="mt-2 text-base text-white/65">
            Name the job, then add one PDF per sheet. Multi-page PDFs stay on
            one sheet.
          </p>
        </div>

        <label className="mb-6 block">
          <span className="mb-2 block text-sm font-medium text-white/80">
            Project name
          </span>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder='e.g. Smith Residence — Basement Renovation'
            disabled={!canInteract}
            className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-base text-white placeholder:text-white/35 focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/40 disabled:opacity-50"
            autoComplete="off"
          />
        </label>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="sr-only"
          aria-label="Choose PDF files"
          onChange={onInputChange}
          disabled={uploading}
        />

        <div
          role="button"
          tabIndex={0}
          onClick={() => canInteract && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && canInteract) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          className={[
            "flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-8 py-10 text-center transition-colors",
            dragActive
              ? "border-sky-400/80 bg-sky-500/10"
              : "border-white/20 bg-white/[0.03] hover:border-white/35 hover:bg-white/[0.05]",
            uploading ? "pointer-events-none opacity-80" : "",
          ].join(" ")}
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
            <svg
              className="h-7 w-7 text-white/90"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Z"
              />
            </svg>
          </div>
          <p className="text-base font-medium text-white">
            Drag &amp; drop PDF sheets here
          </p>
          <p className="mt-1 max-w-sm text-sm text-white/60">
            or click to browse — you can select multiple files
          </p>
        </div>

        {pendingFiles.length > 0 && (
          <ul className="mt-8 space-y-3" aria-label="Selected PDF sheets">
            {pendingFiles.map((p) => (
              <li
                key={p.localId}
                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{p.file.name}</p>
                  <p className="mt-0.5 text-sm text-white/55">
                    {formatFileSize(p.file.size)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={[
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
                      p.status === "ready" &&
                        "bg-white/10 text-white/80 ring-white/20",
                      p.status === "uploading" &&
                        "bg-amber-500/15 text-amber-200 ring-amber-500/35",
                      p.status === "complete" &&
                        "bg-emerald-500/15 text-emerald-200 ring-emerald-500/35",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {p.status === "ready" && "Ready"}
                    {p.status === "uploading" && "Uploading"}
                    {p.status === "complete" && "Complete"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(p.localId)}
                    disabled={uploading || p.status === "uploading"}
                    className="rounded-lg border border-red-500/35 bg-red-950/25 px-3 py-1.5 text-xs font-semibold text-red-100 transition-colors hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {pendingFiles.length > 0 && (
          <div className="mt-8">
            <button
              type="button"
              onClick={() => void startUpload()}
              disabled={uploading || !projectName.trim()}
              className="w-full rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#0a1628] shadow-sm transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {uploading ? "Uploading…" : "Upload all sheets"}
            </button>
          </div>
        )}

        {error && (
          <div
            className="mt-6 rounded-xl border border-red-500/35 bg-red-950/35 px-4 py-3 text-sm text-red-100"
            role="alert"
            aria-live="polite"
          >
            {error}
          </div>
        )}

        {uploading && uploadPhase && (
          <div className="mt-8">
            <div className="mb-2 flex justify-between text-sm text-white/70">
              <span>{uploadPhase}</span>
              <span className="tabular-nums text-white/90">
                {sheetProgress}%
              </span>
            </div>
            <div
              className="h-2.5 w-full overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuenow={sheetProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={
                currentSheetIndex
                  ? `Sheet ${currentSheetIndex} progress`
                  : "Upload progress"
              }
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-400 transition-[width] duration-150 ease-out"
                style={{ width: `${sheetProgress}%` }}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
