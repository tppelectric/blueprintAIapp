"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import type {
  AIAction,
  AIMessage,
  AIResponse,
  AIPageContext,
} from "@/lib/ai-assistant-context";

type ChatMessage = AIMessage & { actions?: AIAction[] };

/** Map assistant button labels to routes when the model omits or mis-sets href. */
const NAV_LABEL_ALIASES: Record<string, string> = {
  "submit material request": "/requests/new",
  "new material request": "/requests/new",
  "material request": "/requests/new",
  "open field log": "/jobs/daily-logs",
  "field log": "/jobs/daily-logs",
  "daily logs": "/jobs/daily-logs",
  "view timesheet": "/timesheets",
  "view timesheets": "/timesheets",
  timesheets: "/timesheets",
};

function normalizeNavigateHref(href: string | undefined): string | null {
  if (href == null) return null;
  const t = href.trim();
  if (!t) return null;
  if (t.startsWith("/")) return t.split(/[?#]/)[0] ?? t;
  if (/^https?:\/\//i.test(t)) return null;
  const path = t.replace(/^\/+/, "");
  return path ? `/${path}` : null;
}

function getPageContext(pathname: string): AIPageContext {
  const parts = pathname.split("/").filter(Boolean);

  if (pathname === "/") return { page: "home", pageTitle: "Home" };
  if (pathname === "/jobs") return { page: "jobs", pageTitle: "Jobs" };
  if (
    pathname === "/jobs/daily-logs" ||
    pathname.startsWith("/jobs/daily-logs/")
  ) {
    return { page: "daily_logs", pageTitle: "Daily Logs" };
  }
  if (pathname.startsWith("/jobs/")) {
    return {
      page: "job_detail",
      pageTitle: "Job Detail",
      entityType: "job",
      entityId: parts[1],
    };
  }
  if (pathname === "/customers")
    return { page: "customers", pageTitle: "Customers" };
  if (pathname === "/inventory/vehicles")
    return { page: "vehicles", pageTitle: "Fleet Vehicles" };
  if (pathname.startsWith("/inventory/vehicles/")) {
    return {
      page: "vehicle_detail",
      pageTitle: "Vehicle Detail",
      entityType: "vehicle",
      entityId: parts[2],
    };
  }
  if (pathname === "/inventory/tools")
    return { page: "tools_inventory", pageTitle: "Tool Inventory" };
  if (pathname === "/inventory")
    return { page: "inventory", pageTitle: "Inventory" };
  if (pathname === "/receipts")
    return { page: "receipts", pageTitle: "Receipts" };
  if (pathname.startsWith("/receipts/")) {
    return {
      page: "receipt_detail",
      pageTitle: "Receipt Detail",
      entityType: "receipt",
      entityId: parts[1],
    };
  }
  if (pathname === "/requests")
    return { page: "requests", pageTitle: "Requests Queue" };
  if (pathname === "/requests/new")
    return { page: "new_request", pageTitle: "New Request" };
  if (pathname.startsWith("/requests/")) {
    return {
      page: "request_detail",
      pageTitle: "Request Detail",
      entityType: "request",
      entityId: parts[1],
    };
  }
  if (pathname === "/my-requests")
    return { page: "my_requests", pageTitle: "My Requests" };
  if (pathname === "/timesheets")
    return { page: "timesheets", pageTitle: "Timesheets" };
  if (pathname === "/team-clock")
    return { page: "team_clock", pageTitle: "Team Clock" };
  if (pathname === "/licenses")
    return { page: "licenses", pageTitle: "Licenses" };
  if (pathname === "/field")
    return { page: "field_punch", pageTitle: "Field Punch" };
  if (pathname === "/dashboard")
    return { page: "dashboard", pageTitle: "My Projects" };
  if (pathname.startsWith("/tools/wifi-analyzer"))
    return { page: "wifi_analyzer", pageTitle: "WiFi Analyzer" };
  if (pathname.startsWith("/tools/av-analyzer"))
    return { page: "av_analyzer", pageTitle: "AV Analyzer" };
  if (pathname.startsWith("/tools/electrical-analyzer"))
    return {
      page: "electrical_analyzer",
      pageTitle: "Electrical Analyzer",
    };
  if (pathname.startsWith("/tools/smarthome-analyzer"))
    return {
      page: "smarthome_analyzer",
      pageTitle: "Smart Home Analyzer",
    };
  if (pathname.startsWith("/tools/nec-checker"))
    return { page: "nec_checker", pageTitle: "NEC Code Checker" };
  if (pathname.startsWith("/tools/load-calculator"))
    return { page: "load_calculator", pageTitle: "Load Calculator" };
  if (pathname.startsWith("/tools/project-describer"))
    return {
      page: "project_describer",
      pageTitle: "AI Project Describer",
    };
  if (pathname.startsWith("/tools"))
    return { page: "tools", pageTitle: "Tools" };
  if (pathname === "/profile")
    return { page: "profile", pageTitle: "My Profile" };
  if (pathname === "/settings/integrations")
    return { page: "settings", pageTitle: "Settings" };
  return { page: "app", pageTitle: "Blueprint AI" };
}

function nowIso(): string {
  return new Date().toISOString();
}

function toHistoryPayload(messages: ChatMessage[]): AIMessage[] {
  return messages.map(({ role, content, timestamp }) => ({
    role,
    content,
    timestamp,
  }));
}

function toPersistPayload(messages: ChatMessage[]): unknown[] {
  return messages.map(({ role, content, timestamp, actions }) => {
    const row: Record<string, unknown> = { role, content, timestamp };
    if (actions?.length) row.actions = actions;
    return row;
  });
}

function parseStoredActions(raw: unknown): AIAction[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: AIAction[] = [];
  for (const a of raw) {
    if (!a || typeof a !== "object") continue;
    const o = a as Record<string, unknown>;
    const type = typeof o.type === "string" ? o.type : "";
    const label = typeof o.label === "string" ? o.label : "";
    if (!type || !label) continue;
    const href = typeof o.href === "string" ? o.href : undefined;
    out.push({ type, label, href });
  }
  return out.length ? out : undefined;
}

function storedRowsToMessages(rows: unknown[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (o.role !== "user" && o.role !== "assistant") continue;
    const content = typeof o.content === "string" ? o.content : "";
    const timestamp =
      typeof o.timestamp === "string" ? o.timestamp : nowIso();
    if (!content.trim()) continue;
    const actions = parseStoredActions(o.actions);
    out.push({
      role: o.role,
      content,
      timestamp,
      ...(actions ? { actions } : {}),
    });
  }
  return out;
}

function SparkleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-6 w-6 text-[#0a1628]"
      aria-hidden
    >
      <path d="M11.25 2.75c.35 0 .67.22.8.55l1.38 3.45 3.45 1.38c.33.13.55.45.55.8s-.22.67-.55.8l-3.45 1.38-1.38 3.45a.875.875 0 01-1.6 0l-1.38-3.45-3.45-1.38a.875.875 0 010-1.6l3.45-1.38 1.38-3.45c.13-.33.45-.55.8-.55zM18 14.5c.28 0 .53.18.64.45l.72 1.8 1.8.72a.7.7 0 010 1.3l-1.8.72-.72 1.8a.7.7 0 01-1.28 0l-.72-1.8-1.8-.72a.7.7 0 010-1.3l1.8-.72.72-1.8c.11-.27.36-.45.64-.45z" />
    </svg>
  );
}

function LoadingDots() {
  return (
    <div className="flex gap-1 px-1 py-2" aria-live="polite" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 animate-pulse rounded-full bg-[#E8C84A]/80"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </div>
  );
}

export function FloatingAIAssistant() {
  const pathname = usePathname();
  const router = useRouter();
  const { showToast } = useAppToast();
  const { role, profile, loading: roleLoading } = useUserRole();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const pageCtx = getPageContext(pathname ?? "/");

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const toggleOpen = useCallback(() => {
    setOpen((o) => {
      const next = !o;
      if (next) setHasUnread(false);
      return next;
    });
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setHasUnread(false);
    void (async () => {
      try {
        await fetch(
          `/api/ai/conversation?page_context=${encodeURIComponent(pageCtx.page)}`,
          { method: "DELETE", credentials: "include" },
        );
      } catch {
        /* ignore */
      }
    })();
  }, [pageCtx.page]);

  const saveMessagesRemote = useCallback(
    async (next: ChatMessage[]) => {
      try {
        await fetch("/api/ai/conversation", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pageContext: pageCtx.page,
            messages: toPersistPayload(next),
          }),
        });
      } catch {
        /* offline or table missing */
      }
    },
    [pageCtx.page],
  );

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: text,
      timestamp: nowIso(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    const context: AIPageContext = {
      ...pageCtx,
      userRole: role ?? undefined,
    };

    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          context,
          history: toHistoryPayload(messages),
        }),
      });

      const j = (await res.json()) as {
        ok?: boolean;
        response?: AIResponse;
        error?: string;
      };

      if (!res.ok || !j.ok || !j.response?.message) {
        setMessages((m) => m.slice(0, -1));
        showToast({
          message: "Assistant unavailable. Try again.",
          variant: "error",
        });
        return;
      }

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: j.response.message,
        timestamp: nowIso(),
        actions: j.response.actions,
      };

      setMessages((m) => {
        const next = [...m, assistantMsg];
        void saveMessagesRemote(next);
        return next;
      });

      setOpen((isOpen) => {
        if (!isOpen) {
          setHasUnread(true);
        }
        return isOpen;
      });
    } catch {
      setMessages((m) => m.slice(0, -1));
      showToast({
        message: "Assistant unavailable. Try again.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [
    input,
    loading,
    messages,
    pageCtx,
    role,
    showToast,
    saveMessagesRemote,
  ]);

  useEffect(() => {
    if (!profile?.id || roleLoading) return;
    const pageKey = pageCtx.page;
    let cancelled = false;
    setMessages([]);
    void (async () => {
      try {
        const r = await fetch(
          `/api/ai/conversation?page_context=${encodeURIComponent(pageKey)}`,
          { credentials: "include" },
        );
        if (!r.ok || cancelled) return;
        const j = (await r.json()) as { messages?: unknown[] };
        const rows = Array.isArray(j.messages) ? j.messages : [];
        if (cancelled) return;
        setMessages(storedRowsToMessages(rows));
      } catch {
        /* table may not exist yet */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id, roleLoading, pageCtx.page]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const onActionClick = (action: AIAction) => {
    if (action.type === "navigate") {
      const href =
        normalizeNavigateHref(action.href) ??
        NAV_LABEL_ALIASES[action.label.trim().toLowerCase()];
      if (href) {
        router.push(href);
        setOpen(false);
        return;
      }
    }
    if (action.type === "create" || action.type === "info") {
      showToast({ message: action.label, variant: "success" });
    }
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  if (!roleLoading && !profile) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={toggleOpen}
        className="fixed bottom-24 right-4 z-[90] flex h-12 w-12 items-center justify-center rounded-full bg-[#E8C84A] shadow-lg ring-2 ring-[#0a1628]/20 transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#E8C84A]/60 sm:right-5"
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
      >
        <SparkleIcon />
        {hasUnread && !open ? (
          <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[#0a1628]" />
        ) : null}
      </button>

      {open ? (
        <div
          className="fixed bottom-40 right-4 z-[90] flex w-80 max-h-[32rem] flex-col overflow-hidden rounded-2xl border border-[#E8C84A]/30 bg-[#0a1628] shadow-2xl sm:right-5 sm:w-96"
          role="dialog"
          aria-label="Blueprint AI Assistant"
        >
          <header className="flex shrink-0 items-start justify-between border-b border-white/10 px-4 py-3">
            <div className="min-w-0 pr-2">
              <h2 className="text-sm font-bold text-white">
                Blueprint AI Assistant
              </h2>
              <p className="truncate text-xs text-white/55">{pageCtx.pageTitle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={clearChat}
                className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
                aria-label="Clear conversation"
                title="Clear conversation"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-4 w-4"
                >
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                }}
                className="rounded-lg p-1.5 text-lg leading-none text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </header>

          <div
            ref={scrollRef}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
          >
            {messages.length === 0 && !loading ? (
              <p className="text-center text-sm text-white/50">
                Ask me anything about your jobs, tools, NEC code, or anything
                Blueprint AI related.
              </p>
            ) : null}
            {messages.map((m, i) => (
              <div key={`${m.timestamp}-${i}`} className="flex flex-col gap-2">
                <div
                  className={
                    m.role === "user"
                      ? "ml-8 flex justify-end"
                      : "mr-4 flex justify-start"
                  }
                >
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[95%] rounded-2xl bg-[#E8C84A]/20 px-3 py-2 text-sm text-white"
                        : "max-w-[95%] rounded-2xl bg-white/[0.06] px-3 py-2 text-sm text-white/90"
                    }
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                </div>
                {m.role === "assistant" && m.actions?.length ? (
                  <div className="mr-4 flex flex-wrap gap-2 pl-0">
                    {m.actions.map((a, ai) => (
                      <button
                        key={`${a.label}-${ai}`}
                        type="button"
                        onClick={() => onActionClick(a)}
                        className="rounded-full border border-[#E8C84A]/40 px-3 py-1 text-xs text-[#E8C84A] hover:bg-[#E8C84A]/10"
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {loading ? (
              <div className="mr-4 flex justify-start">
                <div className="rounded-2xl bg-white/[0.06] px-4">
                  <LoadingDots />
                </div>
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-white/10 p-3">
            <div className="flex gap-2">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                disabled={loading}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Message…"
                className="min-h-[40px] max-h-[120px] flex-1 resize-none rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-[#E8C84A]/40 focus:outline-none disabled:opacity-50"
              />
              <button
                type="button"
                disabled={loading || !input.trim()}
                onClick={() => void sendMessage()}
                className="shrink-0 self-end rounded-lg bg-[#E8C84A] px-3 py-2 text-xs font-bold text-[#0a1628] disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
