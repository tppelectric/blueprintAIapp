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
import { createBrowserClient } from "@/lib/supabase/client";

type JobOption = { id: string; job_name: string; job_number: string };

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
  return t;
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

  const [showInternalNotes, setShowInternalNotes] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadJobs = useCallback(async () => {
    try {
      const sb = createBrowserClient();
      const { data, error } = await sb
        .from("jobs")
        .select("id,job_name,job_number")
        .order("updated_at", { ascending: false });
      if (error) throw error;
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

  useEffect(() => {
    let cancelled = false;
    const date = form.log_date?.trim();
    if (!date) {
      setPunchHint(null);
      return;
    }
    void (async () => {
      try {
        const r = await fetch(
          `/api/daily-logs/punch-hint?date=${encodeURIComponent(date)}`,
          { credentials: "include" },
        );
        const j = (await r.json()) as {
          found?: boolean;
          jobName?: string;
          checkInLabel?: string;
          checkOutLabel?: string;
          checkInDb?: string;
          checkOutDb?: string;
        };
        if (cancelled) return;
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
      } catch {
        if (!cancelled) setPunchHint(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.log_date]);

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
      setForm((f) => ({
        ...f,
        job_id: matchedId ?? f.job_id,
        work_completed: data.work_completed?.trim() || null,
        check_in: parseAiTimeToDb(data.check_in) ?? f.check_in,
        check_out: parseAiTimeToDb(data.check_out) ?? f.check_out,
        anticipated_delays: data.issues_delays?.trim() || null,
        safety_incident: data.safety_incident,
        all_breakers_on: data.all_breakers_on,
        equipment_used: data.equipment_used?.trim() || null,
        equipment_left_onsite: data.equipment_left?.trim() || null,
        next_day_plan: data.next_day_plan?.trim() || null,
        notes: data.notes?.trim() || null,
        breakers_off_reason: !data.all_breakers_on
          ? (data.issues_delays?.trim() || f.breakers_off_reason)
          : f.breakers_off_reason,
      }));

      setEmployeeLines(
        data.employees_onsite.length
          ? [...data.employees_onsite]
          : [""],
      );

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

      if (matchedId) {
        const j = jobs.find((x) => x.id === matchedId);
        if (j) {
          setForm((f) => ({
            ...f,
            job_name: `${j.job_number} · ${j.job_name}`,
          }));
        }
      }
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
      };
      if (!r.ok || !j.ok || !j.data) {
        showToast({
          message: j.error ?? "AI processing failed.",
          variant: "error",
        });
        return;
      }
      const normalized = normalizeProcessDailyLogJson(j.data);
      applyAiResult(normalized);
      showToast({ message: "Form filled from your description.", variant: "success" });
    } catch {
      showToast({ message: "AI request failed.", variant: "error" });
    } finally {
      setProcessingAi(false);
    }
  };

  const toggleListen = () => {
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

      const payload: DailyLogInsert = {
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

      const { data: inserted, error } = await sb
        .from("daily_logs")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;
      const logId = inserted?.id as string | undefined;
      if (!logId) throw new Error("No log id returned.");

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
      showToast({
        message: e instanceof Error ? e.message : "Save failed.",
        variant: "error",
      });
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
          <div className="mt-6 rounded-xl border border-[#E8C84A]/40 bg-[#E8C84A]/10 px-4 py-3 text-sm text-white">
            <p className="font-semibold text-[#E8C84A]">
              ⏱ Punch record found for today
            </p>
            <p className="mt-1 text-white/85">
              Job: {punchHint.jobName ?? "—"}
              <br />
              In: {punchHint.checkInLabel ?? "—"} | Out:{" "}
              {punchHint.checkOutLabel ?? "—"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={usePunchTimes}
                className="rounded-lg bg-[#E8C84A] px-3 py-1.5 text-xs font-bold text-[#0a1628]"
              >
                Use these times
              </button>
              <span className="self-center text-xs text-white/50">
                Or enter shift times manually below.
              </span>
            </div>
          </div>
        ) : null}

        {/* SECTION 1 — AI */}
        <section className="mt-8 rounded-2xl border border-white/15 bg-gradient-to-b from-[#1a2838] to-[#0f1824] p-5 shadow-lg">
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
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={toggleListen}
              className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                listening
                  ? "border-red-400/60 bg-red-500/20 text-red-100"
                  : "border-white/25 bg-white/10 text-white"
              }`}
            >
              {listening ? "Listening…" : "🎙 Microphone"}
            </button>
            <button
              type="button"
              disabled={processingAi}
              onClick={() => void processWithAi()}
              className="rounded-xl bg-[#E8C84A] px-5 py-2.5 text-sm font-bold text-[#0a1628] shadow-md disabled:opacity-50"
            >
              {processingAi ? "Processing…" : "Process with AI"}
            </button>
          </div>
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
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-white/50">
                  Job
                </label>
                <select
                  className={inputSm}
                  value={form.job_id ?? ""}
                  onChange={(e) =>
                    set("job_id")(e.target.value.trim() || null)
                  }
                >
                  <option value="">— None —</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.job_number} · {j.job_name}
                    </option>
                  ))}
                </select>
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
              <div>
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
