"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import { createBrowserClient } from "@/lib/supabase/client";
import type {
  AIAction,
  AIMessage,
  AIResponse,
  AIPageContext,
  AIStructuredAction,
} from "@/lib/ai-assistant-context";

type ChatMessage = AIMessage & { actions?: AIAction[] };

const AI_CHAT_STORAGE_KEY = "ai_chat_messages";

function parseStoredChatMessages(raw: string): ChatMessage[] {
  try {
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    const out: ChatMessage[] = [];
    for (const item of p) {
      if (item == null || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }
      const o = item as Record<string, unknown>;
      if (o.role !== "user" && o.role !== "assistant") continue;
      if (typeof o.content !== "string" || typeof o.timestamp !== "string") {
        continue;
      }
      const msg: ChatMessage = {
        role: o.role,
        content: o.content,
        timestamp: o.timestamp,
      };
      if (Array.isArray(o.actions)) {
        msg.actions = o.actions as AIAction[];
      }
      out.push(msg);
    }
    return out;
  } catch {
    return [];
  }
}

/** Ensure cloned chat DOM is readable on white PDF background. */
function forcePdfReadableColors(root: HTMLElement) {
  const nodes = root.querySelectorAll<HTMLElement>("div, p, span, button, a");
  nodes.forEach((el) => {
    el.style.color = "#0a1628";
  });
  root
    .querySelectorAll<HTMLElement>(".rounded-2xl, .rounded-full")
    .forEach((el) => {
      el.style.backgroundColor = "#f1f5f9";
      el.style.border = "1px solid #e2e8f0";
    });
}

/** Maps material-list payload fields into internal request prefill shape. */
function materialListPrefillExtras(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  if (
    typeof payload.itemDescription === "string" &&
    payload.itemDescription.trim()
  ) {
    extra.itemDescription = payload.itemDescription.trim();
  }
  const lineItems = payload.lineItems ?? payload.line_items;
  if (Array.isArray(lineItems) && lineItems.length > 0) {
    const lines = lineItems.map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const o = item as Record<string, unknown>;
        const desc = [o.description, o.item, o.name, o.label].find(
          (x): x is string => typeof x === "string" && x.trim().length > 0,
        );
        const qty = o.quantity ?? o.qty;
        const qtyStr =
          qty !== undefined && qty !== null && String(qty).trim() !== ""
            ? ` × ${String(qty)}`
            : "";
        return desc ? `${desc.trim()}${qtyStr}` : JSON.stringify(o);
      }
      return String(item);
    });
    const joined = lines.filter(Boolean).join("\n").trim();
    if (joined) {
      if (typeof extra.itemDescription === "string") {
        extra.itemDescription = `${extra.itemDescription}\n${joined}`;
      } else {
        extra.itemDescription = joined;
      }
    }
  }
  if (typeof payload.quantity === "number" || typeof payload.quantity === "string") {
    extra.quantity = payload.quantity;
  }
  if (typeof payload.qty === "number" || typeof payload.qty === "string") {
    extra.quantity = payload.qty;
  }
  return extra;
}

function getPageContext(pathname: string): AIPageContext {
  const parts = pathname.split("/").filter(Boolean);

  if (pathname === "/") return { page: "home", pageTitle: "Home" };
  if (pathname === "/jobs") return { page: "jobs", pageTitle: "Jobs" };
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
  if (pathname === "/proposals/new")
    return { page: "new_proposal", pageTitle: "New Proposal" };
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

const JOB_PAGE_UUID_RE =
  /^\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;

function jobIdFromPathname(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = pathname.match(JOB_PAGE_UUID_RE);
  return m?.[1] ?? null;
}

function toHistoryPayload(messages: ChatMessage[]): AIMessage[] {
  return messages.map(({ role, content, timestamp }) => ({
    role,
    content,
    timestamp,
  }));
}

/** Maps assistant structured action → internal request prefill on `/requests/new`. */
function buildPrefillPayload(structured: AIStructuredAction): Record<string, unknown> {
  const { type, payload } = structured;
  const base: Record<string, unknown> = {
    ...payload,
    _aiStructuredAction: type,
  };
  switch (type) {
    case "CREATE_MATERIAL_LIST": {
      const extras = materialListPrefillExtras(payload);
      return {
        ...base,
        ...extras,
        requestType: "material_order",
      };
    }
    case "CREATE_REQUEST":
    default: {
      const rt = payload.requestType;
      return {
        ...base,
        requestType:
          typeof rt === "string" && rt.trim() ? rt : "other",
      };
    }
  }
}

/** Minimal JSON for `/proposals/new?prefill=` — title + description only. */
function buildProposalPrefillPayload(
  payload: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof payload.title === "string") out.title = payload.title;
  if (typeof payload.description === "string") out.description = payload.description;
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
  const { role, loading: roleLoading } = useUserRole();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatHydrated, setChatHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const pageCtx = getPageContext(pathname ?? "/");
  const contextJobId = useMemo(
    () => jobIdFromPathname(pathname ?? null),
    [pathname],
  );

  const [pdfExportBusy, setPdfExportBusy] = useState(false);
  const [saveJobPanelOpen, setSaveJobPanelOpen] = useState(false);
  const [jobsForSave, setJobsForSave] = useState<
    { id: string; label: string }[]
  >([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [saveChatBusy, setSaveChatBusy] = useState(false);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AI_CHAT_STORAGE_KEY);
      if (raw) {
        const restored = parseStoredChatMessages(raw);
        if (restored.length > 0) {
          setMessages(restored);
        }
      }
    } catch {
      /* ignore */
    }
    setChatHydrated(true);
  }, []);

  useEffect(() => {
    if (!chatHydrated) return;
    try {
      localStorage.setItem(AI_CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* ignore quota / private mode */
    }
  }, [messages, chatHydrated]);

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
    try {
      localStorage.removeItem(AI_CHAT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

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

      setMessages((m) => [...m, assistantMsg]);

      if (j.response.action) {
        try {
          if (j.response.action.type === "CREATE_PROPOSAL") {
            const prefillObj = buildProposalPrefillPayload(
              j.response.action.payload,
            );
            router.push(
              `/proposals/new?prefill=${encodeURIComponent(JSON.stringify(prefillObj))}`,
            );
          } else {
            const prefillObj = buildPrefillPayload(j.response.action);
            router.push(
              `/requests/new?prefill=${encodeURIComponent(JSON.stringify(prefillObj))}`,
            );
          }
          setOpen(false);
        } catch {
          showToast({
            message: "Could not open form from assistant action.",
            variant: "error",
          });
        }
      } else {
        setOpen((isOpen) => {
          if (!isOpen) {
            setHasUnread(true);
          }
          return isOpen;
        });
      }
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
    router,
    showToast,
  ]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const onActionClick = (action: AIAction) => {
    if (action.type === "navigate" && action.href?.startsWith("/")) {
      router.push(action.href);
      setOpen(false);
      return;
    }
    if (action.type === "create" || action.type === "info") {
      showToast({ message: action.label, variant: "success" });
    }
  };

  const handleExportPdf = useCallback(async () => {
    if (messages.length === 0) {
      showToast({
        message: "Nothing to export yet.",
        variant: "error",
      });
      return;
    }
    const source = document.getElementById("chat-export");
    if (!source) {
      showToast({
        message: "Could not find chat content to export.",
        variant: "error",
      });
      return;
    }
    setPdfExportBusy(true);
    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-9999px";
    host.style.top = "0";
    host.style.width = "480px";
    host.style.padding = "16px";
    host.style.fontSize = "11px";
    host.style.fontFamily = "system-ui, Segoe UI, sans-serif";
    host.style.color = "#0a1628";
    host.style.background = "#ffffff";
    host.style.zIndex = "2147483646";
    host.setAttribute("aria-hidden", "true");
    const title = document.createElement("div");
    title.textContent = "Blueprint AI Assistant";
    title.style.fontWeight = "700";
    title.style.marginBottom = "6px";
    host.appendChild(title);
    const sub = document.createElement("div");
    sub.textContent = pageCtx.pageTitle;
    sub.style.color = "#444444";
    sub.style.marginBottom = "12px";
    sub.style.fontSize = "10px";
    host.appendChild(sub);
    const clone = source.cloneNode(true) as HTMLElement;
    forcePdfReadableColors(clone);
    host.appendChild(clone);
    document.body.appendChild(host);
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: 10,
          filename: `blueprint-chat-${ts}.pdf`,
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(host)
        .save();
    } catch {
      showToast({
        message: "Could not export PDF.",
        variant: "error",
      });
    } finally {
      host.remove();
      setPdfExportBusy(false);
    }
  }, [messages.length, pageCtx.pageTitle, showToast]);

  const openSaveJobPanel = useCallback(async () => {
    if (messages.length === 0) {
      showToast({
        message: "Nothing to save yet.",
        variant: "error",
      });
      return;
    }
    setSaveJobPanelOpen(true);
    setSelectedJobId("");
    setJobsForSave([]);
    try {
      const sb = createBrowserClient();
      const { data, error } = await sb
        .from("jobs")
        .select("id, job_name, job_number")
        .order("updated_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      const rows = (data ?? []).map((r) => {
        const num = String((r as { job_number?: string }).job_number ?? "").trim();
        const nm = String((r as { job_name?: string }).job_name ?? "").trim();
        const id = String((r as { id: string }).id);
        const label =
          num && nm ? `${num} · ${nm}` : num || nm || id.slice(0, 8);
        return { id, label };
      });
      setJobsForSave(rows);
      if (contextJobId && rows.some((r) => r.id === contextJobId)) {
        setSelectedJobId(contextJobId);
      } else if (rows[0]) {
        setSelectedJobId(rows[0].id);
      }
    } catch {
      showToast({
        message: "Could not load jobs.",
        variant: "error",
      });
      setSaveJobPanelOpen(false);
    }
  }, [contextJobId, messages.length, showToast]);

  const commitSaveChatToJob = useCallback(async () => {
    if (!selectedJobId.trim()) {
      showToast({ message: "Select a job.", variant: "error" });
      return;
    }
    setSaveChatBusy(true);
    try {
      const res = await fetch(
        `/api/jobs/${encodeURIComponent(selectedJobId)}/save-chat`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: messages }),
        },
      );
      const j = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !j.success) {
        throw new Error(j.error || "Save failed.");
      }
      showToast({ message: "Chat saved to job.", variant: "success" });
      setSaveJobPanelOpen(false);
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Save failed.",
        variant: "error",
      });
    } finally {
      setSaveChatBusy(false);
    }
  }, [messages, selectedJobId, showToast]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  if (roleLoading) {
    return null;
  }

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={toggleOpen}
          className="fixed bottom-24 right-[max(1rem,env(safe-area-inset-right,0px))] z-[80] flex h-12 w-12 items-center justify-center rounded-full bg-[#E8C84A] shadow-lg ring-2 ring-[#0a1628]/20 transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#E8C84A]/60 md:bottom-8 md:right-6"
          aria-label="Open AI assistant"
        >
          <SparkleIcon />
          {hasUnread ? (
            <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[#0a1628]" />
          ) : null}
        </button>
      ) : null}

      {open ? (
        <div
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] right-[max(1rem,env(safe-area-inset-right,0px))] z-[115] flex max-h-[min(32rem,calc(100dvh-6rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)))] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-[#E8C84A]/30 bg-[#0a1628] shadow-2xl md:bottom-8 md:right-6 md:max-h-[min(32rem,calc(100dvh-2.5rem))] md:w-96"
          role="dialog"
          aria-label="Blueprint AI Assistant"
        >
          <header className="flex shrink-0 flex-col gap-2 border-b border-white/10 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 pr-2">
                <h2 className="text-sm font-bold text-white">
                  Blueprint AI Assistant
                </h2>
                <p className="truncate text-xs text-white/55">
                  {pageCtx.pageTitle}
                </p>
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
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={pdfExportBusy || messages.length === 0}
                onClick={() => void handleExportPdf()}
                className="rounded-md border border-white/15 bg-white/[0.06] px-2 py-1 text-[10px] font-semibold text-white/90 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pdfExportBusy ? "Exporting…" : "Export PDF"}
              </button>
              <button
                type="button"
                disabled={saveChatBusy}
                onClick={() => void openSaveJobPanel()}
                className="rounded-md border border-white/15 bg-white/[0.06] px-2 py-1 text-[10px] font-semibold text-white/90 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Save to Job
              </button>
            </div>
            {saveJobPanelOpen ? (
              <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-2">
                <label className="text-[10px] text-white/55">
                  Job
                  <select
                    className="mt-1 w-full rounded-md border border-white/15 bg-[#071422] px-2 py-1.5 text-xs text-white"
                    value={selectedJobId}
                    onChange={(e) => setSelectedJobId(e.target.value)}
                  >
                    <option value="">Select job…</option>
                    {jobsForSave.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSaveJobPanelOpen(false)}
                    className="rounded-md px-2 py-1 text-[10px] text-white/70 hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saveChatBusy || !selectedJobId}
                    onClick={() => void commitSaveChatToJob()}
                    className="rounded-md bg-[#E8C84A] px-2 py-1 text-[10px] font-bold text-[#0a1628] disabled:opacity-40"
                  >
                    {saveChatBusy ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            ) : null}
          </header>

          <div
            ref={scrollRef}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
          >
            <div id="chat-export" className="flex flex-col gap-3">
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
