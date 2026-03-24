"use client";

import { useCallback, useRef, useState } from "react";

export type VoiceInputButtonProps = {
  onTranscript: (text: string) => void;
  /** When true, parent typically appends each segment. When false, parent replaces with the full transcript built so far. */
  onAppend: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognitionCtor(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

export function VoiceInputButton({
  onTranscript,
  onAppend,
  placeholder = "Voice",
  className = "",
  disabled = false,
}: VoiceInputButtonProps) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRec | null>(null);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      try {
        recRef.current?.abort?.();
      } catch {
        /* ignore */
      }
    }
    recRef.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (disabled) return;
    setError(null);
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError(
        "Voice input is not supported in this browser. Try Chrome or Safari.",
      );
      return;
    }
    try {
      const r = new Ctor();
      r.continuous = true;
      r.interimResults = true;
      r.lang = "en-US";
      r.onresult = (ev: Event) => {
        const e = ev as unknown as {
          resultIndex: number;
          results: Array<{ 0: { transcript: string }; isFinal: boolean }>;
        };
        if (onAppend) {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            if (res?.isFinal && res[0]?.transcript?.trim()) {
              onTranscript(`${res[0].transcript.trim()} `);
            }
          }
          return;
        }
        let allFinal = "";
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i];
          if (res?.isFinal && res[0]?.transcript) {
            allFinal += res[0].transcript;
          }
        }
        if (allFinal.trim()) {
          onTranscript(allFinal.trim());
        }
      };
      r.onerror = (ev: Event) => {
        const err = (ev as unknown as { error?: string }).error;
        setError(err || "Speech recognition error");
        setListening(false);
      };
      r.onend = () => setListening(false);
      recRef.current = r;
      r.start();
      setListening(true);
    } catch {
      setError("Could not start microphone.");
    }
  }, [disabled, onAppend, onTranscript]);

  const toggle = useCallback(() => {
    if (disabled) return;
    if (listening) stop();
    else start();
  }, [disabled, listening, start, stop]);

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        title={listening ? "Stop listening" : placeholder}
        className={[
          "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors",
          listening
            ? "border-red-400/50 bg-red-950/40 text-red-100"
            : "border-white/20 bg-white/10 text-white hover:bg-white/15",
          disabled ? "cursor-not-allowed opacity-40" : "",
        ].join(" ")}
        aria-label={listening ? "Stop voice input" : "Start voice input"}
        aria-pressed={listening}
      >
        {listening ? (
          <span className="text-lg leading-none" aria-hidden>
            ■
          </span>
        ) : (
          <MicIcon className="h-5 w-5" />
        )}
      </button>
      {listening ? (
        <span className="text-[10px] font-medium text-[#E8C84A]">
          Listening…
        </span>
      ) : null}
      {error ? (
        <span className="max-w-[10rem] text-center text-[10px] text-red-300">
          {error}
        </span>
      ) : null}
    </div>
  );
}
