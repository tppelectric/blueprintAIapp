"use client";

import { useCallback, useState } from "react";
import { VoiceInputButton } from "@/components/voice-input-button";
import type {
  ProjectDescriptionAnalysis,
  ProjectDescriberHintId,
} from "@/lib/project-describer-types";

const SUCCESS_COPY =
  "Project details filled in from description. Review and adjust as needed.";

const PLACEHOLDER = `Describe your project...

Example: 3 bedroom house, need WiFi throughout, outdoor coverage on patio, around 2500 sqft, prefer Ubiquiti`;

export function AnalyzerProjectAssistant({
  hints,
  roomSectionId,
  onApply,
}: {
  hints: ProjectDescriberHintId[];
  roomSectionId: string;
  onApply: (analysis: ProjectDescriptionAnalysis) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const scrollToRooms = useCallback(() => {
    const el = document.getElementById(roomSectionId);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [roomSectionId]);

  const runAnalyze = useCallback(async () => {
    setErr(null);
    const trimmed = text.trim();
    if (trimmed.length < 20) {
      setErr("Please enter at least 20 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/tools/analyze-project-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: trimmed,
          hints: hints.length ? hints : undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        analysis?: ProjectDescriptionAnalysis;
      };
      if (!res.ok || !data.analysis) {
        throw new Error(data.error || "Could not analyze description.");
      }
      onApply(data.analysis);
      setBanner(SUCCESS_COPY);
      setOpen(false);
      setText("");
      window.setTimeout(() => setBanner(null), 10_000);
      requestAnimationFrame(() => scrollToRooms());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, [hints, onApply, scrollToRooms, text]);

  return (
    <section className="space-y-3 rounded-xl border border-[#E8C84A]/25 bg-[#071422]/90 p-4">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setErr(null);
        }}
        className="flex w-full flex-col items-start gap-0.5 text-left"
      >
        <span className="text-sm font-bold text-[#E8C84A]">
          AI Project Assistant
        </span>
        <span className="text-xs text-white/65">
          Describe your project and let AI fill in the details automatically
        </span>
        <span className="mt-1 text-[10px] uppercase tracking-wide text-white/40">
          {open ? "Click to collapse" : "Click to expand"}
        </span>
      </button>

      {banner ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100/95">
          {banner}
        </p>
      ) : null}

      {open ? (
        <div className="space-y-3 border-t border-white/10 pt-3">
          <label className="block text-sm">
            <span className="text-white/70">Project description</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={PLACEHOLDER}
              className="mt-1 min-h-[180px] w-full resize-y rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white placeholder:text-white/35"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <VoiceInputButton
              onAppend
              placeholder="Voice"
              onTranscript={(t) => setText((prev) => prev + t)}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAnalyze()}
              className="rounded-lg bg-[#E8C84A] px-4 py-2.5 text-sm font-semibold text-[#0a1628] hover:bg-[#f0d56e] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Analyzing…" : "Analyze and Fill"}
            </button>
          </div>
          {err ? (
            <p className="text-sm text-red-300/95" role="alert">
              {err}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
