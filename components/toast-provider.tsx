"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastVariant = "success" | "error" | "warning" | "info";

type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
};

type ShowToast = (opts: {
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
}) => void;

const ToastContext = createContext<{ showToast: ShowToast } | null>(null);

const VARIANT_STYLES: Record<
  ToastVariant,
  string
> = {
  success:
    "border-emerald-500/40 bg-emerald-950/95 text-emerald-100 shadow-emerald-950/40",
  error: "border-red-500/45 bg-red-950/95 text-red-100 shadow-red-950/40",
  warning:
    "border-[#E8C84A]/50 bg-[#2a2310]/95 text-[#f5e6a8] shadow-black/40",
  info: "border-sky-500/40 bg-sky-950/95 text-sky-100 shadow-sky-950/40",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const remove = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t != null) window.clearTimeout(t);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const showToast = useCallback<ShowToast>(
    ({ message, variant = "info", durationMs = 3000 }) => {
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now());
      setToasts((prev) => [...prev, { id, message, variant }]);
      const tid = window.setTimeout(() => remove(id), durationMs);
      timers.current.set(id, tid);
    },
    [remove],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-20 right-4 z-[300] flex max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-sm ${VARIANT_STYLES[t.variant]}`}
            role="status"
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useAppToast(): { showToast: ShowToast } {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: ({ message }) => {
        if (process.env.NODE_ENV === "development") {
          console.warn("[toast] no ToastProvider:", message);
        }
      },
    };
  }
  return ctx;
}
