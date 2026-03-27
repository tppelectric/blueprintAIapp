"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ReceiptCapture } from "@/components/receipt-capture";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import type { DailyLogMaterialLine } from "@/lib/daily-log-ai-types";
import {
  normalizeProcessDailyLogJson,
  serializeMaterialLines,
  serializeMaterialsNeeded,
  type ProcessDailyLogResult,
} from "@/lib/daily-log-ai-types";
import {
  extractMaterialLines,
  matchJobIdFromAiName,
  netHoursAfterLunch,
  parseAiTimeToDb,
} from "@/lib/daily-logs-helpers";
import type { DailyLogInsert, DailyLogRow } from "@/lib/daily-logs-types";
import { dailyLogsToJobtreadCsv } from "@/lib/jobtread-csv";
import { formatDailyLogSaveError } from "@/lib/daily-logs-api-errors";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatReceiptCurrency } from "@/lib/receipts-types";
import { useUserRole } from "@/hooks/use-user-role";

type JobOption = { id: string; job_name: string; job_number: string };

/** Jobs eligible for daily logs (exclude finished / cancelled). */
const DAILY_LOG_JOB_STATUSES = ["Lead", "Quoted", "Active", "On Hold"] as const;

type AssigneeOption = {
  id: string;
  email: string;
  full_name: string;
};

type MaterialNeededRow = DailyLogMaterialLine & { order?: boolean };

const WEATHER_PREFS_KEY = "tpp-weather-prefs";
const DEFAULT_ZIP = "12601";

const PHOTO_CATEGORIES = [
  "Progress",
  "Materials",
  "Issue",
  "Before",
  "After",
  "Inspection",
  "Other",
] as const;
type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];

type PendingPhoto = {
  id: string;
  file: File;
  previewUrl: string;
  caption: string;
  category: PhotoCategory;
};

type PendingDoc = { id: string; file: File };

/** Minimal Web Speech API surface (Chrome / Safari). */
type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((ev: {
    resultIndex: number;
    results: {
      length: number;
      [k: number]: { isFinal: boolean; 0: { transcript: string } };
    };
  }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function toTimeDb(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (/^\d{1,2}:\d{2}$/.test(t)) return `${t.padStart(5, "0")}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  return null;
}

function readActiveZip(): string {
  if (typeof window === "undefined") return DEFAULT_ZIP;
  try {
    const raw = localStorage.getItem(WEATHER_PREFS_KEY);
    if (!raw) return DEFAULT_ZIP;
    const j = JSON.parse(raw) as { activeZip?: string; zips?: string[] };
    const z = j.activeZip?.trim();
    if (z && /^\d{5}$/.test(z)) return z;
    const first = j.zips?.find((x) => /^\d{5}$/.test(x));
    return first ?? DEFAULT_ZIP;
  } catch {
    return DEFAULT_ZIP;
  }
}

function safeStorageFileName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
  return base || "file";
}

function randomId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function formatJobLabel(j: JobOption): string {
  const a = j.job_number.trim();
  const b = j.job_name.trim();
  if (a && b) return `${a} · ${b}`;
  return a || b || "";
}

function getSpeechRecognitionCtor(): (new () => BrowserSpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as typeof window & {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const emptyForm: DailyLogInsert = {
  jobtread_id: null,
  log_date: new Date().toISOString().slice(0, 10),
  job_name: null,
  job_id: null,
  crew_user: null,
  notes: null,
  employees_onsite: null,
  check_in: null,
  check_out: null,
  job_status: null,
  trades_onsite: null,
  visitors_onsite: null,
  additional_notes: null,
  materials_used: null,
  materials_needed: null,
  materials_left_onsite: false,
  equipment_left_onsite: null,
  tpp_equipment_left: false,
  anticipated_delays: null,
  all_breakers_on: true,
  breakers_off_reason: null,
  supply_receipts: null,
  card_type: null,
  store_receipts: null,
  internal_notes: null,
  weather: null,
  lunch_duration_minutes: null,
  equipment_used: null,
  work_completed: null,
  next_day_plan: null,
  safety_incident: false,
  safety_incident_notes: null,
};

export function DailyLogsNewClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preJobId = searchParams.get("jobId")?.trim() || "";
  const preLogDate = searchParams.get("logDate")?.trim() || "";
  const preCheckIn = searchParams.get("checkIn")?.trim() || "";
  const preCheckOut = searchParams.get("checkOut")?.trim() || "";
  const { showToast } = useAppToast();
  const { profile, loading: profileLoading } = useUserRole();

  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [form, setForm] = useState<DailyLogInsert>(() => ({
    ...emptyForm,
    job_id: preJobId || null,
    log_date: preLogDate || emptyForm.log_date,
    check_in: preCheckIn ? toTimeDb(preCheckIn) : null,
    check_out: preCheckOut ? toTimeDb(preCheckOut) : null,
  }));

  const [describeText, setDescribeText] = useState("");
  const [listening, setListening] = useState(false);
  const [processingAi, setProcessingAi] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  const [employeeLines, setEmployeeLines] = useState<string[]>([""]);
  const [materialUsedRows, setMaterialUsedRows] = useState<
    DailyLogMaterialLine[]
  >([{ item: "", qty: "", unit: "" }]);
  const [materialNeededRows, setMaterialNeededRows] = useState<
    MaterialNeededRow[]
  >([{ item: "", qty: "", unit: "", order: false }]);

  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([]);
  const [photoDragOver, setPhotoDragOver] = useState(false);
  const [docDragOver, setDocDragOver] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [weatherLoading, setWeatherLoading] = useState(false);
  const [punchHint, setPunchHint] = useState<{
    found: boolean;
    jobName?: string;
    checkInLabel?: string;
    checkOutLabel?: string;
    checkInDb?: string;
    checkOutDb?: string;
  } | null>(null);

  const formRefForPunch = useRef(form);
  formRefForPunch.current = form;

  const [aiProcessError, setAiProcessError] = useState<{
    message: string;
    rawResponse?: string;
    extractedSnippet?: string;
  } | null>(null);

  const [voiceEnv, setVoiceEnv] = useState<
    "unknown" | "localhost" | "needs_https" | "ok"
  >("unknown");

  const [showInternalNotes, setShowInternalNotes] = useState(false);
  const [saving, setSaving] = useState(false);

  type SessionRec = {
    id: string;
    thumbUrl: string | null;
    vendor: string | null;
    total: number;
  };
  const [sessionReceipts, setSessionReceipts] = useState<SessionRec[]>([]);
  const sessionReceiptIdsRef = useRef<string[]>([]);

  const [aiSuggestedJobId, setAiSuggestedJobId] = useState<string | null>(null);
  const [jobMenuOpen, setJobMenuOpen] = useState(false);
  const [jobInputValue, setJobInputValue] = useState("");
  const jobComboRef = useRef<HTMLDivElement>(null);

  type AiFollowUpFlags = {
    job: boolean;
    crew: boolean;
    times: boolean;
    work: boolean;
  };
  const [aiFollowUp, setAiFollowUp] = useState<AiFollowUpFlags | null>(null);
  const [followUpNonce, setFollowUpNonce] = useState(0);
  const [followUpDraft, setFollowUpDraft] = useState({
    jobId: "",
    jobCustom: "",
    employeeIds: [] as string[],
    checkIn: "",
    checkOut: "",
    work: "",
  });

  const formRef = useRef(form);
  formRef.current = form;

  const loadJobs = useCallback(async () => {
    try {
      const sb = createBrowserClient();
      let data: {
        id: unknown;
        job_name: unknown;
        job_number: unknown;
      }[] | null = null;

      const filtered = await sb
        .from("jobs")
        .select("id,job_name,job_number,status")
        .in("status", [...DAILY_LOG_JOB_STATUSES])
        .order("updated_at", { ascending: false });

      if (filtered.error) {
        const all = await sb
          .from("jobs")
          .select("id,job_name,job_number")
          .order("updated_at", { ascending: false });
        if (all.error) throw all.error;
        data = all.data ?? [];
      } else {
        data = filtered.data ?? [];
      }

      setJobs(
        (data ?? []).map((j) => ({
          id: j.id as string,
          job_name: String(j.job_name ?? ""),
          job_number: String(j.job_number ?? ""),
        })),
      );
    } catch {
      setJobs([]);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const seededSelfRef = useRef(false);
  useEffect(() => {
    if (profileLoading || !profile || seededSelfRef.current) return;
    const fn = profile.first_name?.trim();
    const ln = profile.last_name?.trim();
    const fromParts = [fn, ln].filter(Boolean).join(" ").trim();
    const displayName =
      fromParts ||
      profile.full_name?.trim() ||
      profile.email?.trim() ||
      "";
    if (!displayName) return;
    seededSelfRef.current = true;
    setEmployeeLines((lines) => {
      const names = lines.map((s) => s.trim()).filter(Boolean);
      if (
        names.some(
          (n) => n.toLowerCase() === displayName.toLowerCase(),
        )
      ) {
        return lines;
      }
      return names.length ? [...names, displayName, ""] : [displayName, ""];
    });
  }, [profile, profileLoading]);

  useEffect(() => {
    if (jobMenuOpen) return;
    if (form.job_id) {
      const j = jobs.find((x) => x.id === form.job_id);
      setJobInputValue(j ? formatJobLabel(j) : (form.job_name ?? ""));
    } else {
      setJobInputValue(form.job_name ?? "");
    }
  }, [form.job_id, form.job_name, jobs, jobMenuOpen]);

  useEffect(() => {
    if (!aiFollowUp) return;
    const f = formRef.current;
    setFollowUpDraft({
      jobId: f.job_id ?? "",
      jobCustom: "",
      employeeIds: [],
      checkIn: f.check_in ? String(f.check_in).slice(0, 5) : "",
      checkOut: f.check_out ? String(f.check_out).slice(0, 5) : "",
      work: f.work_completed ?? "",
    });
  }, [aiFollowUp, followUpNonce]);

  useEffect(() => {
    if (!jobMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = jobComboRef.current;
      if (el && !el.contains(e.target as Node)) {
        setJobMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [jobMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/users/for-assignment", {
          credentials: "include",
        });
        const j = (await r.json()) as { users?: AssigneeOption[] };
        if (!cancelled && r.ok && j.users) setAssignees(j.users);
      } catch {
        if (!cancelled) setAssignees([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/user-profile", { credentials: "include" });
        const j = (await r.json()) as { profile?: { role?: string } };
        if (cancelled || !r.ok) return;
        const role = j.profile?.role;
        setShowInternalNotes(role === "admin" || role === "super_admin");
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!form.job_id) return;
    const j = jobs.find((x) => x.id === form.job_id);
    if (!j) return;
    setForm((f) => ({
      ...f,
      job_name: `${j.job_number} · ${j.job_name}`,
    }));
  }, [form.job_id, jobs]);

  const fetchWeather = useCallback(async () => {
    setWeatherLoading(true);
    try {
      const zip = readActiveZip();
      const r = await fetch(`/api/weather?zip=${encodeURIComponent(zip)}`, {
        credentials: "include",
      });
      const j = (await r.json()) as {
        error?: string;
        current?: {
          tempF: number;
          description: string;
          iconEmoji: string;
          cityLabel: string;
        };
      };
      if (!r.ok || j.error || !j.current) {
        if (j.error) showToast({ message: j.error, variant: "error" });
        return;
      }
      const line = `${j.current.iconEmoji} ${j.current.tempF}°F — ${j.current.description} (${j.current.cityLabel})`;
      setForm((f) => ({ ...f, weather: line }));
    } catch {
      showToast({ message: "Could not load weather.", variant: "error" });
    } finally {
      setWeatherLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void fetchWeather();
  }, [fetchWeather]);

  const loadPunchHintForDate = useCallback(
    async (date: string | null | undefined, signal?: AbortSignal) => {
      const d = date?.trim();
      if (!d) {
        if (!signal?.aborted) setPunchHint(null);
        return;
      }
      try {
        const r = await fetch(
          `/api/daily-logs/punch-hint?date=${encodeURIComponent(d)}`,
          { credentials: "include", signal },
        );
        const j = (await r.json()) as {
          found?: boolean;
          jobName?: string;
          checkInLabel?: string;
          checkOutLabel?: string;
          checkInDb?: string;
          checkOutDb?: string;
        };
        if (signal?.aborted) return;
        if (!r.ok) {
          setPunchHint(null);
          return;
        }
        setPunchHint({
          found: Boolean(j.found),
          jobName: j.jobName,
          checkInLabel: j.checkInLabel,
          checkOutLabel: j.checkOutLabel,
          checkInDb: j.checkInDb,
          checkOutDb: j.checkOutDb,
        });
      } catch (e) {
        if (signal?.aborted) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setPunchHint(null);
      }
    },
    [],
  );

  useEffect(() => {
    const ac = new AbortController();
    void loadPunchHintForDate(form.log_date, ac.signal);
    return () => ac.abort();
  }, [form.log_date, loadPunchHintForDate]);

  useEffect(() => {
    const ac = new AbortController();
    const id = window.setTimeout(() => {
      void loadPunchHintForDate(formRefForPunch.current.log_date, ac.signal);
    }, 0);
    return () => {
      clearTimeout(id);
      ac.abort();
    };
  }, [loadPunchHintForDate]);

  useEffect(() => {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      setVoiceEnv("localhost");
    } else if (!window.isSecureContext) {
      setVoiceEnv("needs_https");
    } else {
      setVoiceEnv("ok");
    }
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    const photos = pendingPhotos;
    return () => {
      for (const p of photos) URL.revokeObjectURL(p.previewUrl);
    };
  }, [pendingPhotos]);

  const totalHours = useMemo(
    () =>
      netHoursAfterLunch(
        form.check_in,
        form.check_out,
        form.lunch_duration_minutes,
      ),
    [form.check_in, form.check_out, form.lunch_duration_minutes],
  );

  const set =
    <K extends keyof DailyLogInsert>(key: K) =>
    (v: DailyLogInsert[K]) => {
      setForm((f) => ({ ...f, [key]: v }));
    };

  const applyAiResult = useCallback(
    (data: ProcessDailyLogResult) => {
      const matchedId = matchJobIdFromAiName(data.job_name, jobs);
      setAiSuggestedJobId(matchedId);

      setForm((f) => {
        const resolvedJobName = matchedId
          ? (() => {
              const j = jobs.find((x) => x.id === matchedId);
              return j ? formatJobLabel(j) : f.job_name;
            })()
          : data.job_name?.trim() || f.job_name;

        const nextWork = data.work_completed?.trim() ?? "";
        return {
          ...f,
          job_id: matchedId !== null ? matchedId : f.job_id,
          job_name: resolvedJobName ?? null,
          work_completed: nextWork ? nextWork : f.work_completed,
          check_in: parseAiTimeToDb(data.check_in) ?? f.check_in,
          check_out: parseAiTimeToDb(data.check_out) ?? f.check_out,
          anticipated_delays:
            data.issues_delays?.trim() || f.anticipated_delays,
          safety_incident: data.safety_incident,
          all_breakers_on: data.all_breakers_on,
          equipment_used: data.equipment_used?.trim() || f.equipment_used,
          equipment_left_onsite:
            data.equipment_left?.trim() || f.equipment_left_onsite,
          next_day_plan: data.next_day_plan?.trim() || f.next_day_plan,
          notes: data.notes?.trim() || f.notes,
          trades_onsite: data.trades_onsite?.trim() || f.trades_onsite,
          visitors_onsite: data.visitors_onsite?.trim() || f.visitors_onsite,
          job_status: data.job_status?.trim() || f.job_status,
          additional_notes:
            data.additional_notes?.trim() || f.additional_notes,
          crew_user: data.crew_user?.trim() || f.crew_user,
          breakers_off_reason: !data.all_breakers_on
            ? (data.issues_delays?.trim() || f.breakers_off_reason)
            : f.breakers_off_reason,
        };
      });

      setEmployeeLines((prev) => {
        const prevNames = prev.map((s) => s.trim()).filter(Boolean);
        if (data.employees_onsite.length) {
          const fromAi = data.employees_onsite
            .map((s) => s.trim())
            .filter(Boolean);
          const merged = [...prevNames];
          for (const n of fromAi) {
            if (
              !merged.some((x) => x.toLowerCase() === n.toLowerCase())
            ) {
              merged.push(n);
            }
          }
          return merged.length ? [...merged, ""] : [""];
        }
        return prevNames.length ? [...prevNames, ""] : [""];
      });

      setMaterialUsedRows(
        data.materials_used.length
          ? data.materials_used.map((m) => ({
              item: m.item,
              qty: m.qty,
              unit: m.unit,
            }))
          : [{ item: "", qty: "", unit: "" }],
      );
      setMaterialNeededRows(
        data.materials_needed.length
          ? data.materials_needed.map((m) => ({
              item: m.item,
              qty: m.qty,
              unit: m.unit,
              order: false,
            }))
          : [{ item: "", qty: "", unit: "", order: false }],
      );
    },
    [jobs],
  );

  const processWithAi = async () => {
    const transcript = describeText.trim();
    if (transcript.length < 10) {
      showToast({
        message: "Add at least a few words (10+) to process.",
        variant: "error",
      });
      return;
    }
    setAiProcessError(null);
    setProcessingAi(true);
    try {
      const r = await fetch("/api/tools/process-daily-log", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          jobId: form.job_id?.trim() || null,
          date: form.log_date?.trim() || null,
        }),
      });
      const j = (await r.json()) as {
        ok?: boolean;
        data?: unknown;
        error?: string;
        rawResponse?: string;
        extractedSnippet?: string;
      };

      const rawLog = j.rawResponse ?? "(no raw body)";
      console.log("Claude raw response:", rawLog);

      if (!r.ok) {
        setAiProcessError({
          message: j.error ?? `Request failed (${r.status}).`,
          rawResponse: j.rawResponse,
          extractedSnippet: j.extractedSnippet,
        });
        showToast({
          message: j.error ?? "AI processing failed.",
          variant: "error",
        });
        return;
      }

      if (!j.ok || j.data == null) {
        setAiProcessError({
          message: j.error ?? "AI did not return usable data.",
          rawResponse: j.rawResponse,
          extractedSnippet: j.extractedSnippet,
        });
        showToast({
          message: j.error ?? "AI processing failed.",
          variant: "error",
        });
        return;
      }

      try {
        const normalized = normalizeProcessDailyLogJson(j.data);
        console.log("AI result:", normalized);
        applyAiResult(normalized);

        const matchedAfter = matchJobIdFromAiName(normalized.job_name, jobs);
        const hasJob = !!(
          matchedAfter ||
          (normalized.job_name && normalized.job_name.trim())
        );
        const hasCrewAi = normalized.employees_onsite.length > 0;
        const cin = parseAiTimeToDb(normalized.check_in);
        const cout = parseAiTimeToDb(normalized.check_out);
        const hasTimes = !!(cin && cout);
        const hasWork = !!normalized.work_completed?.trim();

        if (!hasJob || !hasCrewAi || !hasTimes || !hasWork) {
          setAiFollowUp({
            job: !hasJob,
            crew: !hasCrewAi,
            times: !hasTimes,
            work: !hasWork,
          });
          setFollowUpNonce((n) => n + 1);
        } else {
          setAiFollowUp(null);
        }

        setAiProcessError(null);
        showToast({
          message: "Form filled from your description.",
          variant: "success",
        });
      } catch (applyErr) {
        const msg =
          applyErr instanceof Error
            ? applyErr.message
            : "Could not apply AI result to the form.";
        setAiProcessError({
          message: msg,
          rawResponse:
            typeof j.data === "string"
              ? j.data
              : JSON.stringify(j.data, null, 2),
        });
        showToast({ message: msg, variant: "error" });
      }
    } catch {
      setAiProcessError({
        message: "Network error while calling the AI. Check your connection and try again.",
      });
      showToast({ message: "AI request failed.", variant: "error" });
    } finally {
      setProcessingAi(false);
    }
  };

  const toggleListen = () => {
    if (voiceEnv === "localhost") {
      showToast({
        message:
          "Voice input is unreliable on localhost. Use the live site for microphone input.",
        variant: "error",
      });
      return;
    }
    if (voiceEnv === "needs_https") {
      showToast({
        message: "Voice input requires HTTPS. Open the app over a secure connection.",
        variant: "error",
      });
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      showToast({
        message: "Speech recognition is not supported in this browser.",
        variant: "error",
      });
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (ev: {
        resultIndex: number;
        results: {
          length: number;
          [k: number]: { isFinal: boolean; 0: { transcript: string } };
        };
      }) => {
        let chunk = "";
        for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
          if (ev.results[i]?.isFinal) {
            chunk += ev.results[i]![0]?.transcript ?? "";
          }
        }
        if (chunk.trim()) {
          setDescribeText((prev) => {
            const sep = prev && !/\s$/.test(prev) ? " " : "";
            return prev + sep + chunk.trim();
          });
        }
      };
      rec.onerror = () => {
        setListening(false);
        showToast({ message: "Speech recognition error.", variant: "error" });
      };
      rec.onend = () => setListening(false);
      recognitionRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      showToast({ message: "Could not start microphone.", variant: "error" });
    }
  };

  const addPhotoFiles = (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    if (!list.length) {
      showToast({ message: "No image files selected.", variant: "error" });
      return;
    }
    setPendingPhotos((prev) => [
      ...prev,
      ...list.map((file) => ({
        id: randomId(),
        file,
        previewUrl: URL.createObjectURL(file),
        caption: "",
        category: "Progress" as PhotoCategory,
      })),
    ]);
  };

  const addDocFiles = (files: FileList | File[]) => {
    const list = [...files];
    if (!list.length) return;
    setPendingDocs((prev) => [
      ...prev,
      ...list.map((file) => ({ id: randomId(), file })),
    ]);
  };

  const usePunchTimes = () => {
    if (!punchHint?.found || !punchHint.checkInDb || !punchHint.checkOutDb)
      return;
    setForm((f) => ({
      ...f,
      check_in: punchHint.checkInDb!,
      check_out: punchHint.checkOutDb!,
    }));
    showToast({ message: "Times applied from punch record.", variant: "success" });
  };

  const commitJobField = useCallback(() => {
    const q = jobInputValue.trim();
    if (!q) {
      setForm((f) => ({ ...f, job_id: null, job_name: null }));
      setAiSuggestedJobId(null);
      return;
    }
    const lower = q.toLowerCase();
    const j = jobs.find((x) => {
      const label = formatJobLabel(x).toLowerCase();
      return (
        label === lower ||
        x.job_number.trim().toLowerCase() === lower ||
        x.job_name.trim().toLowerCase() === lower
      );
    });
    if (j) {
      setForm((f) => ({
        ...f,
        job_id: j.id,
        job_name: formatJobLabel(j),
      }));
      setJobInputValue(formatJobLabel(j));
    } else {
      setForm((f) => ({
        ...f,
        job_id: null,
        job_name: q,
      }));
    }
  }, [jobInputValue, jobs]);

  const selectJobFromList = (j: JobOption) => {
    setForm((f) => ({
      ...f,
      job_id: j.id,
      job_name: formatJobLabel(j),
    }));
    setJobInputValue(formatJobLabel(j));
    setJobMenuOpen(false);
    if (aiSuggestedJobId && j.id !== aiSuggestedJobId) {
      setAiSuggestedJobId(null);
    }
  };

  const applyFollowUpDone = () => {
    if (!aiFollowUp) return;
    if (aiFollowUp.job) {
      if (followUpDraft.jobId.trim()) {
        const j = jobs.find((x) => x.id === followUpDraft.jobId.trim());
        if (j) {
          setForm((f) => ({
            ...f,
            job_id: j.id,
            job_name: formatJobLabel(j),
          }));
          setJobInputValue(formatJobLabel(j));
        }
      } else if (followUpDraft.jobCustom.trim()) {
        setForm((f) => ({
          ...f,
          job_id: null,
          job_name: followUpDraft.jobCustom.trim(),
        }));
        setJobInputValue(followUpDraft.jobCustom.trim());
      }
    }
    if (aiFollowUp.crew && followUpDraft.employeeIds.length) {
      setEmployeeLines((lines) => {
        const names = lines.map((s) => s.trim()).filter(Boolean);
        const add: string[] = [];
        for (const id of followUpDraft.employeeIds) {
          const u = assignees.find((x) => x.id === id);
          const n = u?.full_name?.trim() || u?.email?.trim();
          if (
            n &&
            !names.some((x) => x.toLowerCase() === n.toLowerCase())
          ) {
            add.push(n);
          }
        }
        const merged = [...names, ...add];
        return merged.length ? [...merged, ""] : [""];
      });
    }
    if (aiFollowUp.times) {
      setForm((f) => ({
        ...f,
        check_in: followUpDraft.checkIn
          ? `${followUpDraft.checkIn}:00`
          : f.check_in,
        check_out: followUpDraft.checkOut
          ? `${followUpDraft.checkOut}:00`
          : f.check_out,
      }));
    }
    if (aiFollowUp.work && followUpDraft.work.trim()) {
      setForm((f) => ({
        ...f,
        work_completed: followUpDraft.work.trim(),
      }));
    }
    setAiFollowUp(null);
  };

  const save = async () => {
    if (!form.log_date?.trim()) {
      showToast({ message: "Choose a log date.", variant: "error" });
      return;
    }
    const materialsUsedText = serializeMaterialLines(
      materialUsedRows.filter((r) => r.item.trim()),
    );
    const materialsNeededText = serializeMaterialsNeeded(
      materialNeededRows.filter((r) => r.item.trim()),
    );
    const employeesText =
      employeeLines.map((s) => s.trim()).filter(Boolean).join("\n") || null;

    setSaving(true);
    try {
      const sb = createBrowserClient();
      const {
        data: { user },
      } = await sb.auth.getUser();

      const formData: DailyLogInsert = {
        ...form,
        log_date: form.log_date.trim(),
        check_in: toTimeDb(String(form.check_in ?? "")),
        check_out: toTimeDb(String(form.check_out ?? "")),
        job_id: form.job_id?.trim() || null,
        job_name: form.job_name?.trim() || null,
        crew_user: form.crew_user?.trim() || null,
        materials_used: materialsUsedText || null,
        materials_needed: materialsNeededText || null,
        employees_onsite: employeesText,
        lunch_duration_minutes:
          form.lunch_duration_minutes != null &&
          !Number.isNaN(Number(form.lunch_duration_minutes))
            ? Math.round(Number(form.lunch_duration_minutes))
            : null,
      };

      const res = await fetch("/api/daily-logs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const text = await res.text();
      let bodyJson: {
        id?: string;
        error?: string;
        details?: string | null;
        hint?: string | null;
        code?: string | null;
      } = {};
      try {
        bodyJson = text ? (JSON.parse(text) as typeof bodyJson) : {};
      } catch {
        showToast({
          message:
            res.ok && !text.trim()
              ? "Save failed: empty response from server."
              : `Save failed (${res.status}). The server returned an invalid response.`,
          variant: "error",
        });
        return;
      }

      if (!res.ok) {
        const primary = (bodyJson.error ?? "").trim();
        const msg = primary
          ? primary
          : formatDailyLogSaveError({
              message: bodyJson.error,
              code: bodyJson.code,
              details: bodyJson.details,
              hint: bodyJson.hint,
              status: res.status,
            });
        showToast({ message: msg, variant: "error" });
        return;
      }

      const logId = bodyJson.id;
      if (!logId) {
        showToast({
          message:
            "Save failed: the server did not return a log id. Your account may lack permission to insert into daily_logs.",
          variant: "error",
        });
        return;
      }

      if (sessionReceiptIdsRef.current.length) {
        for (const rid of sessionReceiptIdsRef.current) {
          const { error: linkErr } = await sb
            .from("receipts")
            .update({ daily_log_id: logId })
            .eq("id", rid);
          if (linkErr) {
            showToast({
              message: `Log saved, but linking a receipt failed: ${linkErr.message}. You can assign it from Receipts.`,
              variant: "error",
            });
          }
        }
        sessionReceiptIdsRef.current = [];
        setSessionReceipts([]);
      }

      const uploadOne = async (
        file: File,
        kind: "photo" | "document",
        meta: { category?: string | null; caption?: string | null },
      ) => {
        const path = `${logId}/${Date.now()}_${safeStorageFileName(file.name)}`;
        const { error: upErr } = await sb.storage
          .from("daily-log-attachments")
          .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || "application/octet-stream",
          });
        if (upErr) throw upErr;
        const { error: insAtt } = await sb.from("daily_log_attachments").insert({
          daily_log_id: logId,
          file_path: path,
          original_name: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          kind,
          category: meta.category ?? null,
          caption: meta.caption?.trim() || null,
          uploaded_by: user?.id ?? null,
        });
        if (insAtt) throw insAtt;
      };

      for (const p of pendingPhotos) {
        await uploadOne(p.file, "photo", {
          category: p.category,
          caption: p.caption,
        });
      }
      for (const d of pendingDocs) {
        await uploadOne(d.file, "document", {
          category: null,
          caption: null,
        });
      }

      showToast({ message: "Daily log saved.", variant: "success" });
      if (form.job_id) {
        router.push(`/jobs/${form.job_id}`);
      } else {
        router.push("/jobs/daily-logs");
      }
    } catch (e) {
      let msg = "Save failed.";
      if (e instanceof Error) {
        msg =
          e.message.includes("Bucket not found") ||
          e.message.includes("new row violates row-level security")
            ? `Upload failed: ${e.message}. Check storage bucket “daily-log-attachments” and RLS policies.`
            : e.message.includes("JWT")
              ? "Your session expired. Sign in again and retry."
              : e.message;
      } else if (e && typeof e === "object" && "message" in e) {
        msg = String((e as { message: unknown }).message);
      }
      showToast({ message: msg, variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const exportDraftCsv = () => {
    const materialsUsedText = serializeMaterialLines(
      materialUsedRows.filter((r) => r.item.trim()),
    );
    const materialsNeededText = serializeMaterialsNeeded(
      materialNeededRows.filter((r) => r.item.trim()),
    );
    const employeesText =
      employeeLines.map((s) => s.trim()).filter(Boolean).join("\n") || null;

    const row: DailyLogRow = {
      id: "draft",
      created_at: new Date().toISOString(),
      jobtread_id: form.jobtread_id,
      log_date: form.log_date,
      job_name: form.job_name,
      job_id: form.job_id,
      crew_user: form.crew_user,
      notes: form.notes,
      employees_onsite: employeesText,
      check_in: form.check_in,
      check_out: form.check_out,
      job_status: form.job_status,
      trades_onsite: form.trades_onsite,
      visitors_onsite: form.visitors_onsite,
      additional_notes: form.additional_notes,
      materials_used: materialsUsedText || null,
      materials_needed: materialsNeededText || null,
      materials_left_onsite: form.materials_left_onsite,
      equipment_left_onsite: form.equipment_left_onsite,
      tpp_equipment_left: form.tpp_equipment_left,
      anticipated_delays: form.anticipated_delays,
      all_breakers_on: form.all_breakers_on,
      breakers_off_reason: form.breakers_off_reason,
      supply_receipts: form.supply_receipts,
      card_type: form.card_type,
      store_receipts: form.store_receipts,
      internal_notes: form.internal_notes,
      weather: form.weather,
      lunch_duration_minutes: form.lunch_duration_minutes,
      equipment_used: form.equipment_used,
      work_completed: form.work_completed,
      next_day_plan: form.next_day_plan,
      safety_incident: form.safety_incident,
      safety_incident_notes: form.safety_incident_notes,
    };
    const csv = dailyLogsToJobtreadCsv([row]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-log-draft-${form.log_date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const ta =
    "app-input min-h-[5rem] w-full resize-y font-sans text-sm leading-relaxed";
  const inputSm = "app-input mt-1 w-full text-sm";

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="jobs" showTppSubtitle />
      <main className="app-page-shell mx-auto max-w-3xl flex-1 py-8 md:py-10">
        <Link
          href="/jobs/daily-logs"
          className="text-sm text-[#E8C84A] hover:underline"
        >
          ← Daily logs
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-white">New daily log</h1>
        <p className="mt-1 text-sm text-white/50">
          Describe your day with voice or text, then review and save.
        </p>

        {punchHint?.found ? (
          <div className="mt-6 rounded-xl border-2 border-[#E8C84A] bg-[#E8C84A]/12 px-5 py-4 shadow-lg shadow-black/30 ring-1 ring-[#E8C84A]/30">
            <p className="text-base font-bold tracking-tight text-[#E8C84A]">
              ⏱ Punch record found for today
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/90">
              <span className="font-semibold text-white">Job:</span>{" "}
              {punchHint.jobName ?? "—"}
              <br />
              <span className="font-semibold text-white">Check in:</span>{" "}
              {punchHint.checkInLabel ?? "—"}
              <br />
              <span className="font-semibold text-white">Check out:</span>{" "}
              {punchHint.checkOutLabel ?? "—"}
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={usePunchTimes}
                className="rounded-xl bg-[#E8C84A] px-6 py-3 text-base font-bold text-[#0a1628] shadow-md transition-colors hover:bg-[#f0d56e]"
              >
                Use These Times
              </button>
              <a
                href="#daily-log-shift-times"
                className="text-center text-sm font-medium text-white/70 underline decoration-white/30 underline-offset-2 hover:text-white sm:text-left"
              >
                Enter manually
              </a>
            </div>
          </div>
        ) : null}

        {aiProcessError ? (
          <div
            className="mt-6 rounded-xl border-2 border-red-500/60 bg-red-950/40 p-4 text-sm text-red-50 shadow-lg"
            role="alert"
          >
            <p className="font-bold text-red-200">AI processing failed</p>
            <p className="mt-2 text-red-100/95">{aiProcessError.message}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-red-200/80">
              Raw response from Claude
            </p>
            <pre className="mt-1 max-h-48 overflow-auto rounded-lg border border-red-500/30 bg-black/40 p-3 text-xs text-red-50/90 whitespace-pre-wrap break-words">
              {aiProcessError.rawResponse?.trim() ||
                "(No raw text returned — see server logs.)"}
            </pre>
            {aiProcessError.extractedSnippet ? (
              <>
                <p className="mt-3 text-xs font-semibold text-red-200/80">
                  Extracted snippet (parse failed)
                </p>
                <pre className="mt-1 max-h-32 overflow-auto rounded-lg border border-red-500/30 bg-black/40 p-3 text-xs text-red-50/90 whitespace-pre-wrap break-words">
                  {aiProcessError.extractedSnippet}
                </pre>
              </>
            ) : null}
            <p className="mt-3 text-xs text-red-200/90">
              Try again with a shorter description, fix any network issues, or
              fill the form manually.
            </p>
            <button
              type="button"
              className="mt-3 rounded-lg border border-red-400/50 bg-red-900/40 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-900/60"
              onClick={() => setAiProcessError(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {aiFollowUp ? (
          <div
            className="mt-6 rounded-2xl border-2 border-[#E8C84A]/50 bg-[#0f1824] p-5 shadow-xl shadow-black/40"
            role="region"
            aria-label="AI follow-up"
          >
            <p className="text-lg font-bold text-[#E8C84A]">
              AI needs a little more info
            </p>
            <p className="mt-1 text-sm text-white/60">
              Fill in the missing details below, then tap Done.
            </p>
            <div className="mt-4 space-y-4">
              {aiFollowUp.job ? (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm font-semibold text-white">
                    Which job was this for?
                  </p>
                  <select
                    className={`${inputSm} mt-2`}
                    value={followUpDraft.jobId}
                    onChange={(e) =>
                      setFollowUpDraft((d) => ({
                        ...d,
                        jobId: e.target.value,
                        jobCustom: "",
                      }))
                    }
                  >
                    <option value="">— Choose a job —</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {formatJobLabel(j)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-white/45">Or enter a new job name</p>
                  <input
                    type="text"
                    className={inputSm}
                    value={followUpDraft.jobCustom}
                    onChange={(e) =>
                      setFollowUpDraft((d) => ({
                        ...d,
                        jobCustom: e.target.value,
                        jobId: "",
                      }))
                    }
                    placeholder="Job not in list yet…"
                  />
                </div>
              ) : null}
              {aiFollowUp.crew ? (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm font-semibold text-white">
                    Who else was on site today?
                  </p>
                  <p className="mt-1 text-xs text-white/45">
                    Hold Ctrl/Cmd to select multiple.
                  </p>
                  <select
                    multiple
                    className={`${inputSm} mt-2 min-h-[7rem]`}
                    value={followUpDraft.employeeIds}
                    onChange={(e) => {
                      const selected = [...e.target.selectedOptions].map(
                        (o) => o.value,
                      );
                      setFollowUpDraft((d) => ({
                        ...d,
                        employeeIds: selected,
                      }));
                    }}
                  >
                    {assignees.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.email}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {aiFollowUp.times ? (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm font-semibold text-white">
                    What time did you start and finish?
                  </p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-white/50">Start</label>
                      <input
                        type="time"
                        className={inputSm}
                        value={followUpDraft.checkIn}
                        onChange={(e) =>
                          setFollowUpDraft((d) => ({
                            ...d,
                            checkIn: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-white/50">End</label>
                      <input
                        type="time"
                        className={inputSm}
                        value={followUpDraft.checkOut}
                        onChange={(e) =>
                          setFollowUpDraft((d) => ({
                            ...d,
                            checkOut: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              ) : null}
              {aiFollowUp.work ? (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm font-semibold text-white">
                    What work was completed today?
                  </p>
                  <textarea
                    className={`${ta} mt-2`}
                    value={followUpDraft.work}
                    onChange={(e) =>
                      setFollowUpDraft((d) => ({
                        ...d,
                        work: e.target.value,
                      }))
                    }
                    placeholder="Describe the work…"
                  />
                </div>
              ) : null}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyFollowUpDone}
                className="rounded-xl bg-[#E8C84A] px-6 py-2.5 text-sm font-bold text-[#0a1628] hover:bg-[#f0d56e]"
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => setAiFollowUp(null)}
                className="rounded-xl border border-white/25 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10"
              >
                Skip for now
              </button>
            </div>
          </div>
        ) : null}

        {/* SECTION 1 — AI */}
        <section className="mt-8 rounded-2xl border-2 border-[#E8C84A] bg-gradient-to-b from-[#1a2838] to-[#0f1824] p-5 shadow-xl shadow-[#E8C84A]/10">
          <h2 className="text-xl font-bold text-white">🎤 Describe Your Day</h2>
          <p className="mt-1 text-sm text-white/60">
            Speak or type what happened and AI will fill in your log.
          </p>
          <textarea
            className={`${ta} mt-4 min-h-[11rem] border-white/20 bg-black/30 text-white placeholder:text-white/35`}
            placeholder={`Tell us about today…\nExample: We worked at Hutton Street, installed kitchen outlets and ran conduit to the panel. Used 50ft of 12/2 wire, 3 outlets and 2 GFCIs. Bill and Giovanni were on site 7am to 3:30pm. Still need the outdoor panel and SER cable.`}
            value={describeText}
            onChange={(e) => setDescribeText(e.target.value)}
          />
          <p className="mt-2 text-xs leading-relaxed text-white/55">
            Tip: Describe what you did, materials used, who was on site, and
            times. AI will fill in your log automatically.
          </p>
          {voiceEnv === "localhost" ? (
            <p className="mt-3 rounded-lg border border-amber-500/35 bg-amber-950/40 px-3 py-2 text-xs leading-relaxed text-amber-100/95">
              🎤 Voice input requires HTTPS. On localhost the microphone may not
              work reliably — use the live site for voice input:{" "}
              <a
                href="https://blueprint-a-iapp.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#E8C84A] underline underline-offset-2 hover:text-[#f0d56e]"
              >
                blueprint-a-iapp.vercel.app
              </a>
            </p>
          ) : voiceEnv === "needs_https" ? (
            <p className="mt-3 rounded-lg border border-amber-500/35 bg-amber-950/40 px-3 py-2 text-xs text-amber-100/95">
              🎤 Voice input requires HTTPS. Open this app over a secure
              connection to use the microphone.
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-start gap-4">
            {voiceEnv === "localhost" || voiceEnv === "needs_https" ? null : (
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={toggleListen}
                  disabled={processingAi}
                  title={listening ? "Stop listening" : "Start voice input"}
                  className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white shadow-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8C84A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1824] disabled:opacity-50 ${
                    listening
                      ? "animate-pulse bg-[#E8C84A] ring-4 ring-[#E8C84A]/90"
                      : "bg-[#0a1628] ring-2 ring-white/15 hover:bg-[#132a45]"
                  }`}
                >
                  <span className="sr-only">
                    {listening ? "Stop listening" : "Tap to speak"}
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-7 w-7"
                    aria-hidden
                  >
                    <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 1 1-10 0H5a7 7 0 0 0 6 6.92V20H9v2h6v-2h-2v-2.08A7 7 0 0 0 19 11h-2Z" />
                  </svg>
                </button>
                <span className="text-center text-xs font-medium text-white/75">
                  {processingAi
                    ? "Processing…"
                    : listening
                      ? "Listening…"
                      : "Tap to speak"}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            disabled={processingAi}
            onClick={() => void processWithAi()}
            className="mt-4 w-full rounded-xl bg-[#E8C84A] px-8 py-3.5 text-base font-bold text-[#0a1628] shadow-lg transition-colors hover:bg-[#f0d56e] disabled:opacity-50 sm:max-w-md"
          >
            {processingAi ? "Processing…" : "Process with AI"}
          </button>
        </section>

        {/* SECTION 2 — Form */}
        <div className="mt-10 space-y-8">
          <h2 className="text-lg font-semibold text-white">Log details</h2>

          <div className="space-y-5 rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#E8C84A]/90">
              Job info
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-white/50">
                  Date *
                </label>
                <input
                  type="date"
                  className={inputSm}
                  value={form.log_date}
                  onChange={(e) => set("log_date")(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-white/50">
                  JobTread / external ID
                </label>
                <input
                  type="text"
                  className={inputSm}
                  value={form.jobtread_id ?? ""}
                  onChange={(e) =>
                    set("jobtread_id")(e.target.value.trim() || null)
                  }
                />
              </div>
              <div className="sm:col-span-2" ref={jobComboRef}>
                <label className="text-xs font-semibold text-white/50">
                  Job
                </label>
                <p className="mt-0.5 text-[11px] text-white/40">
                  Search active jobs, pick from the list, or type a new job name.
                </p>
                <input
                  type="text"
                  className={inputSm}
                  value={jobInputValue}
                  onChange={(e) => {
                    setJobInputValue(e.target.value);
                    setJobMenuOpen(true);
                  }}
                  onFocus={() => setJobMenuOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => {
                      commitJobField();
                      setJobMenuOpen(false);
                    }, 150);
                  }}
                  placeholder="Type to filter jobs…"
                  autoComplete="off"
                />
                {jobMenuOpen && jobs.length > 0 ? (
                  <ul
                    className="mt-1 max-h-56 overflow-auto rounded-lg border border-white/15 bg-[#0a1628] py-1 shadow-xl"
                    role="listbox"
                  >
                    {jobs
                      .filter((j) => {
                        const q = jobInputValue.trim().toLowerCase();
                        if (!q) return true;
                        const label = formatJobLabel(j).toLowerCase();
                        return (
                          label.includes(q) ||
                          j.job_number.toLowerCase().includes(q) ||
                          j.job_name.toLowerCase().includes(q)
                        );
                      })
                      .map((j) => (
                        <li key={j.id}>
                          <button
                            type="button"
                            className={`flex w-full px-3 py-2 text-left text-sm transition-colors ${
                              aiSuggestedJobId === j.id
                                ? "bg-[#E8C84A]/25 font-semibold text-[#E8C84A]"
                                : "text-white/90 hover:bg-white/10"
                            }`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectJobFromList(j)}
                          >
                            {formatJobLabel(j)}
                            {aiSuggestedJobId === j.id ? (
                              <span className="ml-2 text-xs font-normal text-[#E8C84A]/90">
                                (AI match)
                              </span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-white/50">
                  Weather
                </label>
                <div className="mt-1 flex flex-wrap gap-2">
                  <input
                    type="text"
                    className="app-input min-w-[12rem] flex-1 text-sm"
                    value={form.weather ?? ""}
                    onChange={(e) =>
                      set("weather")(e.target.value.trim() || null)
                    }
                    placeholder="Auto-filled from weather widget ZIP"
                  />
                  <button
                    type="button"
                    disabled={weatherLoading}
                    onClick={() => void fetchWeather()}
                    className="rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/10 disabled:opacity-50"
                  >
                    {weatherLoading ? "Loading…" : "Refresh weather"}
                  </button>
                </div>
              </div>
              <div id="daily-log-shift-times">
                <label className="text-xs font-semibold text-white/50">
                  Shift start
                </label>
                <input
                  type="time"
                  className={inputSm}
                  value={
                    form.check_in
                      ? String(form.check_in).slice(0, 5)
                      : ""
                  }
                  onChange={(e) =>
                    set("check_in")(
                      e.target.value ? `${e.target.value}:00` : null,
                    )
                  }
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-white/50">
                  Shift end
                </label>
                <input
                  type="time"
                  className={inputSm}
                  value={
                    form.check_out
                      ? String(form.check_out).slice(0, 5)
                      : ""
                  }
                  onChange={(e) =>
                    set("check_out")(
                      e.target.value ? `${e.target.value}:00` : null,
                    )
                  }
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-white/50">
                  Lunch (minutes)
                </label>
                <input
                  type="number"
                  min={0}
                  className={inputSm}
                  value={form.lunch_duration_minutes ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    set("lunch_duration_minutes")(
                      v === "" ? null : Math.max(0, parseInt(v, 10) || 0),
                    );
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-white/50">
                  Total hours (net)
                </label>
                <input
                  type="text"
                  readOnly
                  className={`${inputSm} bg-white/5 text-white/70`}
                  value={totalHours != null ? String(totalHours) : "—"}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-white/50">
                  Job name (denormalized)
                </label>
                <input
                  type="text"
                  className={inputSm}
                  value={form.job_name ?? ""}
                  onChange={(e) =>
                    set("job_name")(e.target.value.trim() || null)
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-white/50">
                  Job status
                </label>
                <input
                  type="text"
                  className={inputSm}
                  value={form.job_status ?? ""}
                  onChange={(e) =>
                    set("job_status")(e.target.value.trim() || null)
                  }
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#E8C84A]/90">
              Crew
            </h3>
            <div>
              <label className="text-xs font-semibold text-white/50">
                Crew (quick pick)
              </label>
              <select
                className={inputSm}
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) return;
                  const u = assignees.find((x) => x.id === id);
                  const name = u?.full_name?.trim() || u?.email?.trim() || "";
                  if (name) {
                    setEmployeeLines((lines) => {
                      const next = [...lines.filter(Boolean), name];
                      return next.length ? [...next, ""] : [""];
                    });
                  }
                  e.target.value = "";
                }}
              >
                <option value="">— Add employee —</option>
                {assignees.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-white/50">
                Employees on site
              </label>
              <div className="mt-2 space-y-2">
                {employeeLines.map((line, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      className="app-input flex-1 text-sm"
                      value={line}
                      placeholder="Name"
                      onChange={(e) => {
                        const v = e.target.value;
                        setEmployeeLines((rows) => {
                          const next = [...rows];
                          next[i] = v;
                          return next;
                        });
                      }}
                    />
                    <button
                      type="button"
                      className="rounded-lg border border-white/20 px-2 text-xs text-white/70 hover:bg-white/10"
                      onClick={() =>
                        setEmployeeLines((rows) =>
                          rows.filter((_, j) => j !== i),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-xs font-medium text-[#E8C84A] hover:underline"
                  onClick={() =>
                    setEmployeeLines((rows) => [...rows, ""])
                  }
                >
                  + Add employee row
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-white/50">
                Crew / foreman (text)
              </label>
              <input
                type="text"
                className={inputSm}
                value={form.crew_user ?? ""}
                onChange={(e) =>
                  set("crew_user")(e.target.value.trim() || null)
                }
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-white/50">
                Trades on site
              </label>
              <textarea
                className={ta}
                value={form.trades_onsite ?? ""}
                onChange={(e) =>
                  set("trades_onsite")(e.target.value.trim() || null)
                }
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-white/50">
                Visitors / inspectors
              </label>
              <textarea
                className={ta}
                value={form.visitors_onsite ?? ""}
                onChange={(e) =>
                  set("visitors_onsite")(e.target.value.trim() || null)
                }
              />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#E8C84A]/90">
              Work completed
            </h3>
            <textarea
              className={ta}
              value={form.work_completed ?? ""}
              onChange={(e) =>
                set("work_completed")(e.target.value.trim() || null)
              }
              placeholder="Summary of work performed…"
            />
          </div>

          <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#E8C84A]/90">
              Materials used
            </h3>
            {materialUsedRows.map((row, i) => (
              <div
                key={i}
                className="grid gap-2 sm:grid-cols-[1fr_6rem_6rem_auto]"
              >
                <input
                  type="text"
                  className="app-input text-sm"
                  placeholder="Item"
                  value={row.item}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMaterialUsedRows((rows) => {
                      const next = [...rows];
                      next[i] = { ...next[i]!, item: v };
                      return next;
                    });
                  }}
                />
                <input
                  type="text"
                  className="app-input text-sm"
                  placeholder="Qty"
                  value={row.qty}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMaterialUsedRows((rows) => {
                      const next = [...rows];
                      next[i] = { ...next[i]!, qty: v };
                      return next;
                    });
                  }}
                />
                <input
                  type="text"
                  className="app-input text-sm"
                  placeholder="Unit"
                  value={row.unit}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMaterialUsedRows((rows) => {
                      const next = [...rows];
                      next[i] = { ...next[i]!, unit: v };
                      return next;
                    });
                  }}
                />
                <button
                  type="button"
                  className="text-xs text-red-300 hover:underline"
                  onClick={() =>
                    setMaterialUsedRows((rows) =>
                      rows.filter((_, j) => j !== i),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-xs font-medium text-[#E8C84A] hover:underline"
              onClick={() =>
                setMaterialUsedRows((r) => [
                  ...r,
                  { item: "", qty: "", unit: "" },
                ])
              }
            >
              + Add line
            </button>
            {materialUsedRows.some((r) => r.item.trim()) ? (
              <ul className="list-inside list-disc text-xs text-white/45">
                {extractMaterialLines(
                  serializeMaterialLines(
                    materialUsedRows.filter((r) => r.item.trim()),
                  ),
                ).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#E8C84A]/90">
              Materials needed
            </h3>
            {materialNeededRows.map((row, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-lg border border-white/10 p-3 sm:flex-row sm:flex-wrap sm:items-center"
              >
                <input
                  type="text"
                  className="app-input min-w-[8rem] flex-1 text-sm"
                  placeholder="Item"
                  value={row.item}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMaterialNeededRows((rows) => {
                      const next = [...rows];
                      next[i] = { ...next[i]!, item: v };
                      return next;
                    });
                  }}
                />
                <input
                  type="text"
                  className="app-input w-full text-sm sm:w-24"
                  placeholder="Qty"
                  value={row.qty}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMaterialNeededRows((rows) => {
                      const next = [...rows];
                      next[i] = { ...next[i]!, qty: v };
                      return next;
                    });
                  }}
                />
                <input
                  type="text"
                  className="app-input w-full text-sm sm:w-24"
                  placeholder="Unit"
                  value={row.unit}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMaterialNeededRows((rows) => {
                      const next = [...rows];
                      next[i] = { ...next[i]!, unit: v };
                      return next;
                    });
                  }}
                />
                <label className="flex items-center gap-2 whitespace-nowrap text-xs text-white/70">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-white/30"
                    checked={!!row.order}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setMaterialNeededRows((rows) => {
                        const next = [...rows];
                        next[i] = { ...next[i]!, order: checked };
                        return next;
                      });
                    }}
                  />
                  Order
                </label>
                <button
                  type="button"
                  className="text-xs text-red-300 hover:underline"
                  onClick={() =>
                    setMaterialNeededRows((rows) =>
                      rows.filter((_, j) => j !== i),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-xs font-medium text-[#E8C84A] hover:underline"
              onClick={() =>
                setMaterialNeededRows((r) => [
                  ...r,
                  { item: "", qty: "", unit: "", order: false },
                ])
              }
            >
              + Add line
            </button>
          </div>

          <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#E8C84A]/90">
              Equipment
            </h3>
            <div>
              <label className="text-xs font-semibold text-white/50">
                Equipment used
              </label>
              <textarea
                className={ta}
                value={form.equipment_used ?? ""}
                onChange={(e) =>
                  set("equipment_used")(e.target.value.trim() || null)
                }
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-white/50">
                Equipment left on site
              </label>
              <textarea
                className={ta}
                value={form.equipment_left_onsite ?? ""}
                onChange={(e) =>
                  set("equipment_left_onsite")(e.target.value.trim() || null)
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-white/30"
                checked={!!form.tpp_equipment_left}
                onChange={(e) => set("tpp_equipment_left")(e.target.checked)}
              />
              TPP equipment left on site
            </label>
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-white/30"
                checked={!!form.materials_left_onsite}
                onChange={(e) =>
                  set("materials_left_onsite")(e.target.checked)
                }
              />
              Materials left on site
            </label>
          </div>

          <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#E8C84A]/90">
              Safety
            </h3>
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-white/30"
                checked={!!form.safety_incident}
                onChange={(e) => set("safety_incident")(e.target.checked)}
              />
              Safety incident
            </label>
            {form.safety_incident ? (
              <div>
                <label className="text-xs font-semibold text-white/50">
                  Safety incident description
                </label>
                <textarea
                  className={ta}
                  value={form.safety_incident_notes ?? ""}
                  onChange={(e) =>
                    set("safety_incident_notes")(
                      e.target.value.trim() || null,
                    )
                  }
                />
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-white/30"
                checked={!!form.all_breakers_on}
                onChange={(e) => set("all_breakers_on")(e.target.checked)}
              />
              All breakers on
            </label>
            {!form.all_breakers_on ? (
              <div>
                <label className="text-xs font-semibold text-white/50">
                  Explanation (breakers off)
                </label>
                <textarea
                  className={ta}
                  value={form.breakers_off_reason ?? ""}
                  onChange={(e) =>
                    set("breakers_off_reason")(
                      e.target.value.trim() || null,
                    )
                  }
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#E8C84A]/90">
              Receipts
            </h3>
            <ReceiptCapture
              collapsible
              title="📷 Capture receipt"
              jobId={form.job_id}
              onSaved={(rec) => {
                sessionReceiptIdsRef.current = [
                  ...sessionReceiptIdsRef.current,
                  rec.id,
                ];
                void (async () => {
                  const sbc = createBrowserClient();
                  const { data: signed } = await sbc.storage
                    .from("job-receipts")
                    .createSignedUrl(rec.storage_path, 3600);
                  setSessionReceipts((prev) => [
                    ...prev,
                    {
                      id: rec.id,
                      thumbUrl: signed?.signedUrl ?? null,
                      vendor: rec.vendor_name,
                      total: Number(rec.total_amount) || 0,
                    },
                  ]);
                })();
              }}
            />
            {sessionReceipts.length > 0 ? (
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold text-white/60">
                  Captured this session (links when you save the log)
                </p>
                <ul className="mt-2 flex flex-wrap gap-3">
                  {sessionReceipts.map((s) => (
                    <li key={s.id} className="w-[5.5rem]">
                      {s.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.thumbUrl}
                          alt=""
                          className="h-16 w-full rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-full items-center justify-center rounded-md bg-white/5 text-[10px] text-white/40">
                          —
                        </div>
                      )}
                      <p className="mt-1 truncate text-[10px] text-white/55">
                        {s.vendor ?? "—"}
                      </p>
                      <p className="text-xs font-bold text-[#E8C84A]">
                        {formatReceiptCurrency(s.total)}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm font-semibold text-[#E8C84A]">
                  Session running total:{" "}
                  {formatReceiptCurrency(
                    sessionReceipts.reduce((a, b) => a + b.total, 0),
                  )}
                </p>
              </div>
            ) : null}
            <div>
              <label className="text-xs font-semibold text-white/50">
                Supply house receipts
              </label>
              <textarea
                className={ta}
                value={form.supply_receipts ?? ""}
                onChange={(e) =>
                  set("supply_receipts")(e.target.value.trim() || null)
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-white/50">
                  Card type
                </label>
                <input
                  type="text"
                  className={inputSm}
                  value={form.card_type ?? ""}
                  onChange={(e) =>
                    set("card_type")(e.target.value.trim() || null)
                  }
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-white/50">
                  Store / gas receipts
                </label>
                <input
                  type="text"
                  className={inputSm}
                  value={form.store_receipts ?? ""}
                  onChange={(e) =>
                    set("store_receipts")(e.target.value.trim() || null)
                  }
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#E8C84A]/90">
              Notes
            </h3>
            <div>
              <label className="text-xs font-semibold text-white/50">
                General notes
              </label>
              <textarea
                className={ta}
                value={form.notes ?? ""}
                onChange={(e) => set("notes")(e.target.value.trim() || null)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-white/50">
                Next day plan
              </label>
              <textarea
                className={ta}
                value={form.next_day_plan ?? ""}
                onChange={(e) =>
                  set("next_day_plan")(e.target.value.trim() || null)
                }
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-white/50">
                Additional notes
              </label>
              <textarea
                className={ta}
                value={form.additional_notes ?? ""}
                onChange={(e) =>
                  set("additional_notes")(e.target.value.trim() || null)
                }
              />
            </div>
            {showInternalNotes ? (
              <div>
                <label className="text-xs font-semibold text-amber-200/80">
                  Internal notes (admin only)
                </label>
                <textarea
                  className={ta}
                  value={form.internal_notes ?? ""}
                  onChange={(e) =>
                    set("internal_notes")(e.target.value.trim() || null)
                  }
                />
              </div>
            ) : null}
          </div>
        </div>

        {/* SECTION 3 — Photos */}
        <section className="mt-10 space-y-4">
          <h2 className="text-lg font-semibold text-white">📸 Photos</h2>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addPhotoFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addPhotoFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") photoInputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setPhotoDragOver(true);
            }}
            onDragLeave={() => setPhotoDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setPhotoDragOver(false);
              if (e.dataTransfer.files?.length) {
                addPhotoFiles(e.dataTransfer.files);
              }
            }}
            onClick={() => photoInputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center text-sm transition-colors ${
              photoDragOver
                ? "border-[#E8C84A] bg-[#E8C84A]/10 text-white"
                : "border-white/25 bg-white/[0.02] text-white/60 hover:border-white/40"
            }`}
          >
            Drag photos here or click to browse
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  cameraInputRef.current?.click();
                }}
              >
                Camera
              </button>
            </div>
          </div>
          {pendingPhotos.length > 0 ? (
            <ul className="space-y-4">
              {pendingPhotos.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-3 rounded-lg border border-white/10 bg-black/20 p-3 sm:flex-row"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.previewUrl}
                    alt=""
                    className="h-28 w-40 shrink-0 rounded-md object-cover"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      type="text"
                      className="app-input w-full text-sm"
                      placeholder="Caption"
                      value={p.caption}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPendingPhotos((rows) =>
                          rows.map((x) =>
                            x.id === p.id ? { ...x, caption: v } : x,
                          ),
                        );
                      }}
                    />
                    <select
                      className="app-input w-full text-sm"
                      value={p.category}
                      onChange={(e) => {
                        const v = e.target.value as PhotoCategory;
                        setPendingPhotos((rows) =>
                          rows.map((x) =>
                            x.id === p.id ? { ...x, category: v } : x,
                          ),
                        );
                      }}
                    >
                      {PHOTO_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="text-xs text-red-300 hover:underline"
                      onClick={() => {
                        URL.revokeObjectURL(p.previewUrl);
                        setPendingPhotos((rows) =>
                          rows.filter((x) => x.id !== p.id),
                        );
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {/* SECTION 4 — Documents */}
        <section className="mt-10 space-y-4">
          <h2 className="text-lg font-semibold text-white">📎 Documents</h2>
          <input
            ref={docInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addDocFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") docInputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDocDragOver(true);
            }}
            onDragLeave={() => setDocDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDocDragOver(false);
              if (e.dataTransfer.files?.length) {
                addDocFiles(e.dataTransfer.files);
              }
            }}
            onClick={() => docInputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center text-sm transition-colors ${
              docDragOver
                ? "border-[#E8C84A] bg-[#E8C84A]/10 text-white"
                : "border-white/25 bg-white/[0.02] text-white/60 hover:border-white/40"
            }`}
          >
            Drag PDFs, tickets, voice notes, or any files here — or click to
            browse
          </div>
          {pendingDocs.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {pendingDocs.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                >
                  <span className="truncate text-white/90">
                    {d.file.name}
                  </span>
                  <span className="text-xs text-white/45">
                    {(d.file.size / 1024).toFixed(1)} KB ·{" "}
                    {d.file.type || "unknown"}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-red-300 hover:underline"
                    onClick={() =>
                      setPendingDocs((rows) =>
                        rows.filter((x) => x.id !== d.id),
                      )
                    }
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="btn-primary btn-h-11"
          >
            {saving ? "Saving…" : "Save log"}
          </button>
          <button
            type="button"
            onClick={exportDraftCsv}
            className="btn-secondary btn-h-11 border-[#E8C84A]/45 text-[#E8C84A]"
          >
            Export draft to CSV
          </button>
        </div>
      </main>
    </div>
  );
}
