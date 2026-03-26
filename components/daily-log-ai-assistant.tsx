"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { ProcessDailyLogResult } from "@/lib/daily-log-ai-types";

type SpeechRecCtor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: Event & { results: unknown }) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): SpeechRecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecCtor;
    webkitSpeechRecognition?: SpeechRecCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Props = {
  transcript: string;
  onTranscriptChange: Dispatch<SetStateAction<string>>;
  jobId: string | null;
  logDate: string;
  onProcessed: (data: ProcessDailyLogResult) => void;
};

export function DailyLogAiAssistant({
  transcript,
  onTranscriptChange,
  jobId,
  logDate,
  onProcessed,
}: Props) {
  const [listening, setListening] = useState(false);
  const [processBusy, setProcessBusy] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const recRef = useRef<InstanceType<SpeechRecCtor> | null>(null);

  const stopListening = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    recRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => {
    return () => stopListening();
  }, [stopListening]);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setProcessError("Speech recognition is not supported in this browser.");
      return;
    }
    setProcessError(null);
    try {
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      rec.onresult = (ev: Event) => {
        const e = ev as unknown as {
          resultIndex: number;
          results: Array<{ isFinal: boolean; 0: { transcript: string } }>;
        };
        let added = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r?.isFinal) added += r[0]?.transcript ?? "";
        }
        const t = added.trim();
        if (!t) return;
        onTranscriptChange((prev) => {
          const gap = prev && !prev.endsWith(" ") ? " " : "";
          return `${prev}${gap}${t} `;
        });
      };
      rec.onerror = () => {
        setListening(false);
        recRef.current = null;
      };
      rec.onend = () => {
        setListening(false);
        recRef.current = null;
      };
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setProcessError("Could not start microphone.");
    }
  }, [onTranscriptChange]);

  const processWithAi = async () => {
    const t = transcript.trim();
    if (t.length < 10) {
      setProcessError("Add a bit more detail before processing (10+ characters).");
      return;
    }
    setProcessError(null);
    setProcessBusy(true);
    try {
      const r = await fetch("/api/tools/process-daily-log", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: t,
          jobId: jobId || undefined,
          date: logDate,
        }),
      });
      const j = (await r.json()) as {
        ok?: boolean;
        data?: ProcessDailyLogResult;
        error?: string;
      };
      if (!r.ok || !j.data) {
        setProcessError(j.error ?? "Processing failed.");
        return;
      }
      onProcessed(j.data);
    } catch {
      setProcessError("Network error.");
    } finally {
      setProcessBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[#E8C84A]/35 bg-gradient-to-br from-[#E8C84A]/10 to-white/[0.02] p-5 shadow-lg">
      <h2 className="text-xl font-bold text-white">
        🎤 Describe Your Day
      </h2>
      <p className="mt-1 text-sm text-white/60">
        Speak or type what happened and AI will fill in your log
      </p>

      <textarea
        className="app-input mt-4 min-h-[10rem] w-full resize-y font-sans text-sm leading-relaxed"
        placeholder={`Tell us about today…
Example: We worked at Hutton Street, installed kitchen outlets and ran conduit to the panel. Used 50ft of 12/2 wire, 3 outlets and 2 GFCIs. Bill and Giovanni were on site 7am to 3:30pm. Still need the outdoor panel and SER cable.`}
        value={transcript}
        onChange={(e) => onTranscriptChange(e.target.value)}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => (listening ? stopListening() : startListening())}
          className={
            listening
              ? "inline-flex items-center gap-2 rounded-xl border border-amber-400/50 bg-amber-500/20 px-4 py-2.5 text-sm font-semibold text-amber-100"
              : "inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
          }
        >
          <span aria-hidden>{listening ? "⏹" : "🎙️"}</span>
          {listening ? "Listening…" : "Microphone"}
        </button>
        <button
          type="button"
          disabled={processBusy}
          onClick={() => void processWithAi()}
          className="inline-flex items-center gap-2 rounded-xl bg-[#E8C84A] px-5 py-2.5 text-sm font-bold text-[#0a1628] shadow-md disabled:opacity-50"
        >
          {processBusy ? "Processing…" : "Process with AI"}
        </button>
      </div>
      {processError ? (
        <p className="mt-2 text-sm text-red-300" role="alert">
          {processError}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-white/40">
        Voice input works best in Chrome and Safari (HTTPS).
      </p>
    </section>
  );
}
