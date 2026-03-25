"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ToolPageHeader } from "@/components/tool-page-header";
import { VoiceInputButton } from "@/components/voice-input-button";
import { ProjectPackageDocModal } from "@/components/project-package-doc-modal";
import { createBrowserClient } from "@/lib/supabase/client";
import type { ProjectDescriberHintId } from "@/lib/project-describer-types";
import type {
  GeneratedProjectPackage,
  ProjectDescriptionAnalysis,
} from "@/lib/project-describer-types";
import {
  analysisToAvRooms,
  analysisToSmartHomeRooms,
  analysisToWifiRooms,
  floorsFromAnalysis,
  STORAGE_AV,
  STORAGE_SMARTHOME,
  STORAGE_WIFI,
  totalSqFtFromAnalysis,
} from "@/lib/project-describer-prefill";
import { TPP_COMPANY_FULL } from "@/lib/tpp-branding";

const PLACEHOLDER = `Describe your project here...

Example: 4000 sqft house in Hyde Park.
Client wants whole home audio in 8 rooms,
home theater in basement with projector,
outdoor speakers on back patio, Control4
automation throughout, Lutron RadioRA3
lighting, 4 exterior cameras, and WiFi
throughout. Budget around $150,000.`;

const HINTS: { id: ProjectDescriberHintId; label: string }[] = [
  { id: "electrical", label: "Electrical work" },
  { id: "wifi", label: "WiFi/Networking" },
  { id: "av", label: "Audio/Video" },
  { id: "smarthome", label: "Smart Home/Automation" },
  { id: "low_voltage", label: "Low Voltage" },
  { id: "all", label: "All of the above" },
];

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `pd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function moneyRange(a: ProjectDescriptionAnalysis): string {
  if (a.budget_label?.trim()) return a.budget_label.trim();
  const lo = a.budget_min_usd;
  const hi = a.budget_max_usd;
  if (lo != null && hi != null)
    return `approximately $${lo.toLocaleString()} – $${hi.toLocaleString()}`;
  if (lo != null) return `from $${lo.toLocaleString()}`;
  if (hi != null) return `up to $${hi.toLocaleString()}`;
  return "Not specified";
}

export function ProjectDescriberClient() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [hints, setHints] = useState<ProjectDescriberHintId[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ProjectDescriptionAnalysis | null>(
    null,
  );
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeDebugRaw, setAnalyzeDebugRaw] = useState<string | null>(null);
  const [analyzeExtractedSnippet, setAnalyzeExtractedSnippet] = useState<
    string | null
  >(null);

  const [pkgGenerating, setPkgGenerating] = useState(false);
  const [pkg, setPkg] = useState<GeneratedProjectPackage | null>(null);
  const [pkgError, setPkgError] = useState<string | null>(null);
  const [pkgModalOpen, setPkgModalOpen] = useState(false);

  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [jobs, setJobs] = useState<{ id: string; job_name: string; job_number: string }[]>([]);
  const [jobId, setJobId] = useState<string>("");

  useEffect(() => {
    void (async () => {
      try {
        const sb = createBrowserClient();
        const { data } = await sb
          .from("jobs")
          .select("id,job_name,job_number")
          .order("updated_at", { ascending: false })
          .limit(100);
        setJobs((data ?? []) as typeof jobs);
      } catch {
        setJobs([]);
      }
    })();
  }, []);

  const toggleHint = (id: ProjectDescriberHintId) => {
    setHints((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const runAnalyze = useCallback(async () => {
    setAnalyzeError(null);
    setAnalyzeDebugRaw(null);
    setAnalyzeExtractedSnippet(null);
    setAnalysis(null);
    setPkg(null);
    setAnalyzing(true);
    try {
      const res = await fetch("/api/tools/analyze-project-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          hints,
          projectTypes: hints,
        }),
      });
      const j = (await res.json()) as {
        analysis?: ProjectDescriptionAnalysis;
        error?: string;
        raw?: string;
        rawText?: string;
        extractedSnippet?: string | null;
      };
      if (!res.ok) {
        setAnalyzeDebugRaw(j.raw ?? j.rawText ?? null);
        setAnalyzeExtractedSnippet(j.extractedSnippet ?? null);
        throw new Error(j.error ?? "Analysis failed");
      }
      if (!j.analysis) throw new Error("No analysis returned");
      setAnalysis(j.analysis);
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }, [description, hints]);

  const edited = analysis;

  const runGeneratePackage = useCallback(async () => {
    if (!edited) return;
    setPkgError(null);
    setPkgGenerating(true);
    try {
      const res = await fetch("/api/tools/generate-project-package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          analysis: edited,
        }),
      });
      const j = (await res.json()) as {
        package?: GeneratedProjectPackage;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Generation failed");
      if (!j.package) throw new Error("No package returned");
      setPkg(j.package);
      setPkgModalOpen(true);
    } catch (e) {
      setPkgError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setPkgGenerating(false);
    }
  }, [description, edited]);

  const pushWifi = useCallback(() => {
    if (!edited) return;
    const rooms = analysisToWifiRooms(edited, newId);
    sessionStorage.setItem(
      STORAGE_WIFI,
      JSON.stringify({
        rooms,
        projectName: "AI Project Describer",
        totalSqFt: totalSqFtFromAnalysis(edited),
        floors: floorsFromAnalysis(edited),
      }),
    );
    router.push("/tools/wifi-analyzer");
  }, [edited, router]);

  const pushAv = useCallback(() => {
    if (!edited) return;
    const rooms = analysisToAvRooms(edited, newId);
    sessionStorage.setItem(
      STORAGE_AV,
      JSON.stringify({
        rooms,
        projectName: "AI Project Describer",
        totalSqFt: totalSqFtFromAnalysis(edited),
        floors: floorsFromAnalysis(edited),
      }),
    );
    router.push("/tools/av-analyzer");
  }, [edited, router]);

  const pushSh = useCallback(() => {
    if (!edited) return;
    const rooms = analysisToSmartHomeRooms(edited, newId);
    sessionStorage.setItem(
      STORAGE_SMARTHOME,
      JSON.stringify({
        rooms,
        projectName: "AI Project Describer",
        totalSqFt: totalSqFtFromAnalysis(edited),
        floors: floorsFromAnalysis(edited),
      }),
    );
    router.push("/tools/smarthome-analyzer");
  }, [edited, router]);

  const saveToSupabase = useCallback(async () => {
    if (!edited || !description.trim()) return;
    setSaveBusy(true);
    setSaveMsg(null);
    try {
      const sb = createBrowserClient();
      const payload = {
        analysis: edited,
        generatedPackage: pkg,
        hints,
      };
      const { error } = await sb.from("project_descriptions").insert({
        description: description.trim(),
        detected_json: payload as unknown as Record<string, unknown>,
        job_id: jobId || null,
      });
      if (error) throw error;
      setSaveMsg(
        jobId
          ? "Saved and linked to job."
          : "Saved to project descriptions.",
      );
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaveBusy(false);
    }
  }, [description, edited, hints, jobId, pkg]);

  const devicesLine = useMemo(() => {
    if (!edited?.devices.length) return "—";
    return edited.devices
      .map((d) => `${d.category} ×${d.quantity}`)
      .join(", ");
  }, [edited]);

  const systemsLine = useMemo(() => {
    if (!edited?.systems.length) return "—";
    return edited.systems.map((s) => s.name + (s.brand ? ` (${s.brand})` : "")).join(", ");
  }, [edited]);

  const roomsLine = useMemo(() => {
    if (!edited?.rooms.length) return "—";
    return edited.rooms.map((r) => r.name).join(", ");
  }, [edited]);

  return (
    <div className="flex min-h-screen flex-col">
      <ToolPageHeader
        title="AI Project Describer"
        subtitle="Describe your project and get a complete work scope, materials list, and proposal"
        showToolsBackLink
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <section className="rounded-2xl border border-white/12 bg-white/[0.04] p-5 sm:p-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[#E8C84A]">
            Project description
          </h2>
          <div className="mt-3 flex gap-2">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={12}
              className="min-h-[220px] w-full flex-1 resize-y rounded-xl border border-white/15 bg-[#071422] px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-[#E8C84A]/50 focus:outline-none focus:ring-1 focus:ring-[#E8C84A]/40"
            />
            <VoiceInputButton
              onAppend
              placeholder="Voice"
              className="shrink-0"
              onTranscript={(t) => setDescription((prev) => prev + t)}
            />
          </div>

          <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-white/50">
            Project type hints (optional)
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {HINTS.map((h) => (
              <label
                key={h.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 bg-[#071422]/80 px-3 py-2 text-sm text-white/85 hover:border-[#E8C84A]/40"
              >
                <input
                  type="checkbox"
                  checked={hints.includes(h.id)}
                  onChange={() => toggleHint(h.id)}
                  className="rounded border-white/30"
                />
                {h.label}
              </label>
            ))}
          </div>

          <button
            type="button"
            disabled={analyzing || description.trim().length < 20}
            onClick={() => void runAnalyze()}
            className="mt-8 w-full rounded-xl border-2 border-[#E8C84A]/70 bg-[#E8C84A] py-3.5 text-base font-bold text-[#0a1628] shadow-sm transition-colors hover:bg-[#f0d56e] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {analyzing
              ? "AI is analyzing your project description…"
              : "Analyze Project"}
          </button>
          {analyzeError ? (
            <div className="mt-3 space-y-2 rounded-lg border border-red-500/35 bg-red-950/20 p-3 text-left">
              <p className="text-sm font-medium text-red-200">{analyzeError}</p>
              <p className="text-xs text-white/50">
                If this persists, check the server log for{" "}
                <code className="text-white/70">Claude raw response</code>.
              </p>
              {analyzeExtractedSnippet ? (
                <details className="text-xs">
                  <summary className="cursor-pointer text-amber-200/90">
                    Extracted JSON snippet (debug)
                  </summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded border border-white/10 bg-black/40 p-2 text-white/70">
                    {analyzeExtractedSnippet}
                  </pre>
                </details>
              ) : null}
              {analyzeDebugRaw ? (
                <details className="text-xs">
                  <summary className="cursor-pointer text-amber-200/90">
                    Raw model response (debug)
                  </summary>
                  <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded border border-white/10 bg-black/40 p-2 text-white/70">
                    {analyzeDebugRaw}
                  </pre>
                </details>
              ) : null}
            </div>
          ) : null}
        </section>

        {edited ? (
          <>
            <section className="mt-10 rounded-2xl border border-white/12 bg-white/[0.04] p-5 sm:p-6">
              <h2 className="text-sm font-bold uppercase tracking-wide text-[#E8C84A]">
                Project summary
              </h2>
              <ul className="mt-4 space-y-2 text-sm text-white/85">
                <li>
                  <span className="text-white/55">Types:</span>{" "}
                  {edited.project_types.length
                    ? edited.project_types.join(", ")
                    : "—"}
                </li>
                <li>
                  <span className="text-white/55">Scope size:</span>{" "}
                  {edited.scope_size}
                </li>
                <li>
                  <span className="text-white/55">Budget:</span>{" "}
                  {moneyRange(edited)}
                </li>
                <li>
                  <span className="text-white/55">Rooms / areas:</span>{" "}
                  {edited.room_count_estimate || edited.rooms.length}
                </li>
                <li>
                  <span className="text-white/55">Complexity:</span>{" "}
                  {edited.complexity}
                </li>
                {edited.key_items_summary ? (
                  <li className="pt-2 text-white/70">{edited.key_items_summary}</li>
                ) : null}
              </ul>
            </section>

            <section className="mt-6 rounded-2xl border border-white/12 bg-white/[0.04] p-5 sm:p-6">
              <h2 className="text-sm font-bold uppercase tracking-wide text-[#E8C84A]">
                Detected items
              </h2>
              <dl className="mt-4 space-y-3 text-sm text-white/85">
                <div>
                  <dt className="text-white/55">Rooms</dt>
                  <dd>{roomsLine}</dd>
                </div>
                <div>
                  <dt className="text-white/55">Devices</dt>
                  <dd>{devicesLine}</dd>
                </div>
                <div>
                  <dt className="text-white/55">Systems</dt>
                  <dd>{systemsLine}</dd>
                </div>
                <div>
                  <dt className="text-white/55">Budget</dt>
                  <dd>{moneyRange(edited)}</dd>
                </div>
              </dl>
              <p className="mt-4 text-xs text-white/45">
                Re-run analysis after editing the description above if you need
                to correct detections. For fine edits, use each analyzer after
                pre-fill.
              </p>
            </section>

            <section className="mt-10 rounded-2xl border border-white/12 bg-white/[0.04] p-5 sm:p-6">
              <h2 className="text-sm font-bold uppercase tracking-wide text-[#E8C84A]">
                Generate documents
              </h2>
              <div className="mt-4 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={pushWifi}
                  className="rounded-xl border border-teal-500/40 bg-teal-950/30 px-4 py-3 text-left text-sm font-semibold text-teal-100 transition-colors hover:bg-teal-950/45"
                >
                  Generate Wi‑Fi plan → opens Wi‑Fi Analyzer pre-populated
                </button>
                <button
                  type="button"
                  onClick={pushAv}
                  className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-left text-sm font-semibold text-rose-100 transition-colors hover:bg-rose-950/45"
                >
                  Generate AV plan → opens AV Analyzer pre-populated
                </button>
                <button
                  type="button"
                  onClick={pushSh}
                  className="rounded-xl border border-cyan-500/40 bg-cyan-950/30 px-4 py-3 text-left text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-950/45"
                >
                  Generate Smart Home plan → opens Smart Home Analyzer
                  pre-populated
                </button>
                <button
                  type="button"
                  disabled={pkgGenerating}
                  onClick={() => void runGeneratePackage()}
                  className="rounded-xl border-2 border-[#E8C84A]/60 bg-[#E8C84A]/15 px-4 py-3 text-left text-sm font-bold text-[#E8C84A] transition-colors hover:bg-[#E8C84A]/25 disabled:opacity-50"
                >
                  {pkgGenerating
                    ? "Generating your complete project package…"
                    : "Generate complete package (scope, work order, proposal, BOM, labor)"}
                </button>
                {pkg ? (
                  <button
                    type="button"
                    onClick={() => setPkgModalOpen(true)}
                    className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
                  >
                    View generated documents
                  </button>
                ) : null}
                {pkgError ? (
                  <p className="text-sm text-red-300">{pkgError}</p>
                ) : null}
              </div>
            </section>

            <section className="mt-10 rounded-2xl border border-white/12 bg-white/[0.04] p-5 sm:p-6">
              <h2 className="text-sm font-bold uppercase tracking-wide text-[#E8C84A]">
                Save &amp; link
              </h2>
              <p className="mt-2 text-xs text-white/50">
                Stored in Supabase as <code className="text-white/70">project_descriptions</code>{" "}
                (description, analysis JSON, optional generated package).
              </p>
              <label className="mt-4 block text-xs text-white/60">
                Link to job (optional)
                <select
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
                >
                  <option value="">— None —</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.job_number} · {j.job_name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => void saveToSupabase()}
                className="mt-4 rounded-xl border border-emerald-500/45 bg-emerald-950/35 px-4 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-950/50 disabled:opacity-50"
              >
                {saveBusy ? "Saving…" : "Save to database"}
              </button>
              {saveMsg ? (
                <p className="mt-2 text-sm text-white/75">{saveMsg}</p>
              ) : null}
            </section>
          </>
        ) : null}

        <p className="mt-10 text-center text-xs text-white/40">
          {TPP_COMPANY_FULL} · AI-assisted estimates — verify all quantities on
          site.
        </p>
      </main>

      <ProjectPackageDocModal
        open={pkgModalOpen}
        onClose={() => setPkgModalOpen(false)}
        pkg={pkg}
      />
    </div>
  );
}
