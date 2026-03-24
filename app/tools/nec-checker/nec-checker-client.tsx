"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ToolPageHeader } from "@/components/tool-page-header";
import { LinkToJobDialog } from "@/components/link-to-job-dialog";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  NEC_CHECKLIST_SECTIONS,
  countViolations,
} from "@/lib/nec-checker-data";
import { downloadNecChecklistPdf } from "@/lib/nec-checklist-pdf";
import { NecAiQuestionPanel } from "./nec-ai-question-panel";
import { NecQuickReferenceGuides } from "./nec-quick-reference";

const NYS_CUTOFF = new Date("2025-12-30T23:59:59.999Z");

function GoldSectionTitle({ children }: { children: string }) {
  return (
    <div className="mb-4">
      <h2 className="border-l-4 border-[#E8C84A] pl-3 text-base font-bold uppercase tracking-wide text-white/95">
        {children}
      </h2>
      <div className="mt-3 h-px bg-gradient-to-r from-[#E8C84A]/50 via-[#E8C84A]/20 to-transparent" />
    </div>
  );
}

const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
];

export function NecCheckerClient() {
  const [projectName, setProjectName] = useState("");
  const [state, setState] = useState("NY");
  const [permitDate, setPermitDate] = useState("");
  const [occupancyType, setOccupancyType] = useState("Residential");
  const [constructionType, setConstructionType] = useState("New Construction");
  const [answers, setAnswers] = useState<Record<string, boolean | undefined>>(
    {},
  );
  const [runEdition, setRunEdition] = useState<"2023" | "2017">("2023");
  const [msg, setMsg] = useState<string | null>(null);
  const [savedNecId, setSavedNecId] = useState<string | null>(null);
  const [jobLinkOpen, setJobLinkOpen] = useState(false);

  const permitAsDate = useMemo(() => {
    if (!permitDate) return null;
    const d = new Date(permitDate + "T12:00:00");
    return Number.isNaN(d.getTime()) ? null : d;
  }, [permitDate]);

  const nysBanner = useMemo(() => {
    if (state !== "NY") return null;
    if (!permitAsDate) return null;
    if (permitAsDate > NYS_CUTOFF) return null;
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
        <p className="font-semibold">
          This project may fall under 2017 NEC. Confirm with your AHJ.
        </p>
        <p className="mt-2 text-amber-200/90">
          Run checklist under:{" "}
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="nec-ed"
              checked={runEdition === "2023"}
              onChange={() => setRunEdition("2023")}
              className="accent-amber-400"
            />
            2023 NEC
          </label>{" "}
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="nec-ed"
              checked={runEdition === "2017"}
              onChange={() => setRunEdition("2017")}
              className="accent-amber-400"
            />
            2017 NEC (reference mode)
          </label>
        </p>
      </div>
    );
  }, [state, permitAsDate, runEdition]);

  const effectiveEdition = useMemo(() => {
    if (state === "NY" && permitAsDate && permitAsDate > NYS_CUTOFF)
      return "2023";
    if (state === "NY" && permitAsDate && permitAsDate <= NYS_CUTOFF)
      return runEdition;
    return "2023";
  }, [state, permitAsDate, runEdition]);

  const { pass, fail, total } = countViolations(answers);
  const answered = pass + fail;
  const allAnswered = answered === total && total > 0;

  const summaryOk = allAnswered && fail === 0;

  const setAns = (id: string, v: boolean) => {
    setAnswers((p) => ({ ...p, [id]: v }));
  };

  const saveChecklist = async () => {
    setMsg(null);
    try {
      const sb = createBrowserClient();
      const { data, error } = await sb
        .from("nec_checklists")
        .insert({
          project_name: projectName.trim() || "Untitled",
          jurisdiction: state,
          permit_date: permitDate || null,
          nec_edition: effectiveEdition,
          occupancy_type: occupancyType,
          answers_json: answers,
          violations_count: fail,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (data?.id) setSavedNecId(String(data.id));
      setMsg("Checklist saved.");
    } catch (e) {
      setMsg(
        e instanceof Error ? e.message : "Save failed (run Supabase SQL?).",
      );
    }
  };

  const exportPdf = () => {
    void downloadNecChecklistPdf({
      projectName,
      jurisdiction: state,
      permitDate: permitDate || "—",
      necEdition: effectiveEdition,
      occupancyType,
      constructionType,
      answers,
    });
  };

  return (
    <div className="min-h-screen bg-[#0a1628] text-white">
      <ToolPageHeader
        title="NEC 2023 Code Checker"
        subtitle="New York State Edition"
      >
        <Link
          href="/tools/electrical-reference"
          className="rounded-lg border border-emerald-500/45 bg-emerald-950/30 px-3 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-950/45"
        >
          Electrical Reference
        </Link>
        <Link
          href="/tools/motor-hvac-calculator"
          className="rounded-lg border border-amber-500/45 bg-amber-950/30 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-950/45"
        >
          Motor / HVAC
        </Link>
      </ToolPageHeader>

      <main className="mx-auto max-w-3xl space-y-12 px-6 py-8">
        <section>
          <GoldSectionTitle>AI question</GoldSectionTitle>
          <NecAiQuestionPanel
            jurisdiction={state}
            necEdition={effectiveEdition}
          />
        </section>

        <section>
          <GoldSectionTitle>Quick reference</GoldSectionTitle>
          <NecQuickReferenceGuides />
        </section>

        <section>
          <GoldSectionTitle>Pre-inspection checklist</GoldSectionTitle>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-xs text-white/55">
              Set jurisdiction and job context for exports and NEC edition logic.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="text-white/70">Project name</span>
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-white/70">State / jurisdiction</span>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                >
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Permit date</span>
                <input
                  type="date"
                  value={permitDate}
                  onChange={(e) => setPermitDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Occupancy type</span>
                <select
                  value={occupancyType}
                  onChange={(e) => setOccupancyType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                >
                  <option>Residential</option>
                  <option>Commercial</option>
                  <option>Multifamily</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Construction type</span>
                <select
                  value={constructionType}
                  onChange={(e) => setConstructionType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
                >
                  <option>New Construction</option>
                  <option>Remodel</option>
                  <option>Addition</option>
                </select>
              </label>
            </div>
            <p className="mt-3 text-xs text-white/50">
              Effective edition: <strong>{effectiveEdition} NEC</strong>
              {state === "NY" && permitAsDate && permitAsDate > NYS_CUTOFF
                ? " (NYS: permit after Dec 30, 2025 → 2023 NEC applied)"
                : null}
            </p>
            {nysBanner}

            <div className="mt-5 flex flex-wrap gap-3 border-t border-white/10 pt-5">
              <button
                type="button"
                onClick={() => setJobLinkOpen(true)}
                className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-500"
              >
                Save to Job
              </button>
              <button
                type="button"
                onClick={exportPdf}
                className="rounded-lg border border-violet-400/50 bg-violet-950/40 px-4 py-2.5 text-sm font-semibold text-violet-100 hover:bg-violet-950/55"
              >
                Export PDF
              </button>
              <button
                type="button"
                onClick={() => void saveChecklist()}
                className="rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15"
              >
                Save checklist
              </button>
            </div>
            {msg ? (
              <p className="mt-3 text-sm text-white/70">{msg}</p>
            ) : null}
            {!savedNecId ? (
              <p className="mt-2 text-xs text-amber-200/90">
                Save the checklist once to get an ID, then use Save to Job to
                attach it.
              </p>
            ) : null}
          </div>

          <div className="mt-8 space-y-6">
            {NEC_CHECKLIST_SECTIONS.map((sec) => (
              <div
                key={sec.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                <h3 className="text-base font-semibold text-white">
                  {sec.title}{" "}
                  <span className="text-sm font-normal text-sky-300/90">
                    ({sec.nec})
                  </span>
                </h3>
                <ul className="mt-4 space-y-3">
                  {sec.items.map((item) => {
                    const v = answers[item.id];
                    const showResult = v !== undefined;
                    return (
                      <li
                        key={item.id}
                        className="rounded-lg border border-white/10 bg-black/20 p-4"
                      >
                        <p className="text-sm leading-snug">
                          {item.label}{" "}
                          <span className="text-white/45">[{item.necRef}]</span>
                        </p>
                        <div className="mt-2 flex flex-wrap gap-4 text-sm">
                          <label className="inline-flex cursor-pointer items-center gap-2">
                            <input
                              type="radio"
                              name={`chk-${item.id}`}
                              checked={v === true}
                              onChange={() => setAns(item.id, true)}
                              className="accent-emerald-500"
                            />
                            Pass
                          </label>
                          <label className="inline-flex cursor-pointer items-center gap-2">
                            <input
                              type="radio"
                              name={`chk-${item.id}`}
                              checked={v === false}
                              onChange={() => setAns(item.id, false)}
                              className="accent-red-400"
                            />
                            Fail
                          </label>
                        </div>
                        {showResult ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                            {v === true ? (
                              <span className="text-emerald-300">✓ Pass</span>
                            ) : (
                              <span className="text-red-300">✗ Fail</span>
                            )}
                            {v === false ? (
                              <span className="text-white/65">
                                {item.resolution}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          {allAnswered ? (
            <div
              className={`mt-8 rounded-xl border px-4 py-4 text-sm font-semibold ${
                summaryOk
                  ? "border-emerald-500/45 bg-emerald-950/40 text-emerald-100"
                  : "border-red-500/45 bg-red-950/45 text-red-100"
              }`}
            >
              {summaryOk
                ? `✅ ${pass} of ${total} items passing — No violations detected`
                : `🚩 ${fail} violations found — Review items above`}
            </div>
          ) : (
            <p className="mt-8 text-sm text-white/50">
              Answer all checklist items to see the summary banner.
            </p>
          )}
        </section>

        <p className="text-xs text-white/45">
          Checklist is a field aid only. Always confirm requirements with the
          adopted code, local amendments, and your AHJ.
        </p>

        <LinkToJobDialog
          open={jobLinkOpen}
          onOpenChange={setJobLinkOpen}
          attachmentType="nec_checklist"
          attachmentId={savedNecId}
          attachmentLabel={projectName}
        />
      </main>
    </div>
  );
}
