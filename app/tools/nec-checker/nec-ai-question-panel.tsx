"use client";

import { jsPDF } from "jspdf";
import type { ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sliceSection(
  text: string,
  header: string,
  nextHeaders: string[],
): string {
  const pattern = new RegExp("^\\s*" + escapeRe(header) + "\\s*", "im");
  const match = text.match(pattern);
  if (!match || match.index === undefined) return "";
  const start = match.index + match[0].length;
  const tail = text.slice(start);
  let end = tail.length;
  for (const h of nextHeaders) {
    const reStop = new RegExp("^\\s*" + escapeRe(h), "im");
    const found = tail.search(reStop);
    if (found !== -1 && found < end) end = found;
  }
  return tail.slice(0, end).trim();
}

export function parseNecFormattedAnswer(raw: string) {
  return {
    answer: sliceSection(raw, "ANSWER:", [
      "NEC REFERENCE:",
      "NYS NOTE:",
      "ADDITIONAL:",
    ]),
    necReference: sliceSection(raw, "NEC REFERENCE:", [
      "NYS NOTE:",
      "ADDITIONAL:",
    ]),
    nysNote: sliceSection(raw, "NYS NOTE:", ["ADDITIONAL:"]),
    additional: sliceSection(raw, "ADDITIONAL:", []),
    raw,
  };
}

const NEC_CITE =
  /\b(NEC\s+\d{3}\.\d+[A-Za-z]?(?:\([A-Za-z0-9.]+\))?)\b/gi;

function TextWithBlueNec({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const nodes: ReactNode[] = [];
  const re = new RegExp(NEC_CITE.source, NEC_CITE.flags);
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(<span key={`t-${key++}`}>{text.slice(last, m.index)}</span>);
    }
    nodes.push(
      <mark
        key={`n-${key++}`}
        className="rounded bg-sky-500/30 px-0.5 font-medium text-sky-100"
      >
        {m[1]}
      </mark>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    nodes.push(<span key={`t-${key++}`}>{text.slice(last)}</span>);
  }
  return <span className={className}>{nodes}</span>;
}

function isNysNone(note: string): boolean {
  return /^\s*none\.?\s*$/i.test(note.trim());
}

const PDF_BRAND = "TPP Electric";
const PDF_DOC_TITLE = "NEC Code Reference";
const PDF_FOOTER = "Blueprint AI — blueprint-a-iapp.vercel.app";

function tokenizeNecCitations(text: string): { cite: boolean; s: string }[] {
  const out: { cite: boolean; s: string }[] = [];
  const re = new RegExp(NEC_CITE.source, NEC_CITE.flags);
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push({ cite: false, s: text.slice(last, m.index) });
    }
    out.push({ cite: true, s: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push({ cite: false, s: text.slice(last) });
  }
  return out;
}

function drawFooter(doc: jsPDF, pageW: number, pageH: number, margin: number): void {
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.setFont("helvetica", "normal");
  doc.text(PDF_FOOTER, margin, pageH - 28);
  doc.setTextColor(0, 0, 0);
}

/** Writes plain + NEC-highlighted text with word wrap; returns next Y; adds pages as needed. */
function writeBodyText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineHeight: number,
  margin: number,
  pageH: number,
  bottomReserve: number,
): number {
  let cy = y;
  let cx = x;
  doc.setFontSize(10);
  const tokens = tokenizeNecCitations(text);
  const pageBreak = () => {
    doc.addPage();
    cy = margin + 24;
    cx = x;
  };

  for (const tok of tokens) {
    const chunks = tok.s.split(/(\s+)/);
    for (const chunk of chunks) {
      if (!chunk) continue;
      doc.setFont("helvetica", tok.cite ? "bold" : "normal");
      if (tok.cite) {
        doc.setTextColor(0, 102, 180);
      } else {
        doc.setTextColor(33, 33, 33);
      }
      const w = doc.getTextWidth(chunk);
      if (cx + w > x + maxW && cx > x) {
        cx = x;
        cy += lineHeight;
        if (cy > pageH - bottomReserve) pageBreak();
      }
      doc.text(chunk, cx, cy);
      cx += w;
    }
  }
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  return cy + lineHeight;
}

function writeSectionHeading(doc: jsPDF, title: string, y: number, margin: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  doc.text(title, margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(33, 33, 33);
  return y + 16;
}

function downloadNecAnswerPdf(opts: {
  question: string;
  parsed: ReturnType<typeof parseNecFormattedAnswer>;
}): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxW = pageW - margin * 2;
  const lineHeight = 14;
  const bottomReserve = 56;
  const { parsed, question } = opts;

  let y = margin + 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(20, 20, 20);
  doc.text(PDF_BRAND, margin, y);
  y += 22;

  doc.setFontSize(20);
  doc.text(PDF_DOC_TITLE, margin, y);
  y += 28;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const stamp = new Date().toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  doc.setTextColor(70, 70, 70);
  doc.text(`Generated: ${stamp}`, margin, y);
  y += 22;
  doc.setTextColor(33, 33, 33);

  y = writeSectionHeading(doc, "Question", y, margin);
  y = writeBodyText(
    doc,
    question,
    margin,
    y,
    maxW,
    lineHeight,
    margin,
    pageH,
    bottomReserve,
  );
  y += 6;
  if (y > pageH - bottomReserve) {
    doc.addPage();
    drawFooter(doc, pageW, pageH, margin);
    y = margin + 24;
  }

  const answerBody =
    parsed.answer.trim() || parsed.raw.trim() || "(No answer text.)";
  y = writeSectionHeading(doc, "Answer", y, margin);
  y = writeBodyText(
    doc,
    answerBody,
    margin,
    y,
    maxW,
    lineHeight,
    margin,
    pageH,
    bottomReserve,
  );
  y += 4;

  if (parsed.necReference.trim()) {
    if (y > pageH - bottomReserve - 40) {
      doc.addPage();
      drawFooter(doc, pageW, pageH, margin);
      y = margin + 24;
    }
    y = writeSectionHeading(doc, "NEC article citations", y, margin);
    y = writeBodyText(
      doc,
      parsed.necReference,
      margin,
      y,
      maxW,
      lineHeight,
      margin,
      pageH,
      bottomReserve,
    );
    y += 4;
  }

  if (parsed.nysNote.trim()) {
    if (y > pageH - bottomReserve - 40) {
      doc.addPage();
      drawFooter(doc, pageW, pageH, margin);
      y = margin + 24;
    }
    y = writeSectionHeading(doc, "NYS notes", y, margin);
    const nysBody = isNysNone(parsed.nysNote)
      ? "None applicable."
      : parsed.nysNote;
    y = writeBodyText(
      doc,
      nysBody,
      margin,
      y,
      maxW,
      lineHeight,
      margin,
      pageH,
      bottomReserve,
    );
    y += 4;
  }

  if (parsed.additional.trim()) {
    if (y > pageH - bottomReserve - 40) {
      doc.addPage();
      drawFooter(doc, pageW, pageH, margin);
      y = margin + 24;
    }
    y = writeSectionHeading(doc, "Additional", y, margin);
    y = writeBodyText(
      doc,
      parsed.additional,
      margin,
      y,
      maxW,
      lineHeight,
      margin,
      pageH,
      bottomReserve,
    );
  }

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    drawFooter(doc, pageW, pageH, margin);
  }

  const safe =
    question
      .slice(0, 40)
      .replace(/[^\w\- ]+/g, "")
      .trim()
      .replace(/\s+/g, "-") || "nec-answer";
  doc.save(`nec-reference-${safe}.pdf`);
}

export function NecAiQuestionPanel({
  jurisdiction,
  necEdition,
}: {
  jurisdiction: string;
  necEdition: string;
}) {
  const [qInput, setQInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const [rawAnswer, setRawAnswer] = useState<string | null>(null);
  const askAbortRef = useRef<AbortController | null>(null);

  const parsed = useMemo(() => {
    if (rawAnswer === null) return null;
    return parseNecFormattedAnswer(rawAnswer);
  }, [rawAnswer]);

  const clearAll = useCallback(() => {
    askAbortRef.current?.abort();
    askAbortRef.current = null;
    setQInput("");
    setRawAnswer(null);
    setLastQuestion(null);
    setError(null);
    setLoading(false);
  }, []);

  const ask = useCallback(async () => {
    const question = qInput.trim();
    if (!question) return;
    askAbortRef.current?.abort();
    const ac = new AbortController();
    askAbortRef.current = ac;
    setLoading(true);
    setError(null);
    setRawAnswer(null);
    try {
      const res = await fetch("/api/nec-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          jurisdiction,
          nec_edition: necEdition,
        }),
        signal: ac.signal,
      });
      const json = (await res.json()) as { answer?: string; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Request failed.");
        return;
      }
      setLastQuestion(question);
      setRawAnswer(json.answer ?? "");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError("Network error. Try again.");
    } finally {
      if (askAbortRef.current === ac) {
        setLoading(false);
        askAbortRef.current = null;
      }
    }
  }, [qInput, jurisdiction, necEdition]);

  return (
    <section className="rounded-2xl border border-violet-500/25 bg-violet-950/20 p-6 print:border print:bg-white print:text-black">
      <h2 className="text-lg font-semibold text-white print:text-black">
        Ask Any NEC Code Question
      </h2>
      <p className="mt-1 text-sm text-violet-200/90 print:text-gray-800">
        Powered by Claude AI — Always includes NEC article citations
      </p>
      <textarea
        value={qInput}
        onChange={(e) => setQInput(e.target.value)}
        rows={5}
        placeholder={
          "Example: Does a bathroom need a dedicated circuit? What GFCI protection is required in a kitchen? What is the minimum service size for a new single family home in NY?"
        }
        className="mt-4 w-full resize-y rounded-xl border border-white/15 bg-[#0a1628] px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none focus:ring-2 focus:ring-violet-500/40 print:border-gray-300 print:bg-white print:text-black"
        disabled={loading}
      />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void ask()}
          disabled={loading || !qInput.trim()}
          className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-45 print:bg-violet-800"
        >
          Ask Question
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="rounded-lg border border-violet-400/45 bg-transparent px-5 py-2.5 text-sm font-semibold text-violet-100 hover:bg-violet-500/15 print:border-violet-700 print:text-violet-950"
        >
          Clear
        </button>
      </div>

      {loading ? (
        <p
          className="mt-4 text-sm font-medium text-violet-200/95"
          role="status"
          aria-live="polite"
        >
          Looking up NEC code…
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      {parsed !== null && lastQuestion ? (
        <div className="mt-6 rounded-xl border border-white/12 bg-black/25 p-5 print:border-gray-300 print:bg-gray-50">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/50 print:text-gray-600">
            Your question
          </p>
          <p className="mt-1 text-sm text-white/90 print:text-black">
            {lastQuestion}
          </p>

          <div className="mt-5 space-y-4 border-t border-white/10 pt-5 print:border-gray-200">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/80 print:text-gray-700">
                Answer
              </p>
              <p className="mt-1 text-sm leading-relaxed text-white/88 print:text-black">
                {parsed.answer ? (
                  <TextWithBlueNec text={parsed.answer} />
                ) : (
                  <TextWithBlueNec text={parsed.raw} />
                )}
              </p>
            </div>

            {parsed.necReference ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-200/90 print:text-gray-700">
                  NEC reference
                </p>
                <p className="mt-1 text-sm leading-relaxed text-sky-100/95 print:text-sky-900">
                  <TextWithBlueNec text={parsed.necReference} />
                </p>
              </div>
            ) : null}

            {parsed.nysNote && !isNysNone(parsed.nysNote) ? (
              <div className="rounded-lg border border-amber-500/35 bg-amber-950/35 px-3 py-3 print:border-amber-300 print:bg-amber-50">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-200 print:text-amber-900">
                  NYS note
                </p>
                <p className="mt-1 text-sm leading-relaxed text-amber-50/95 print:text-amber-950">
                  <TextWithBlueNec text={parsed.nysNote} />
                </p>
              </div>
            ) : parsed.nysNote && isNysNone(parsed.nysNote) ? (
              <p className="text-xs text-white/40 print:text-gray-500">
                NYS note: None
              </p>
            ) : null}

            {parsed.additional ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/50 print:text-gray-700">
                  Additional
                </p>
                <p className="mt-1 text-sm leading-relaxed text-white/80 print:text-black">
                  <TextWithBlueNec text={parsed.additional} />
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-5 border-t border-white/10 pt-4 print:border-gray-200">
            <button
              type="button"
              onClick={() =>
                downloadNecAnswerPdf({ question: lastQuestion, parsed })
              }
              className="rounded-lg border border-emerald-400/50 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/25 print:border-emerald-700 print:text-emerald-900"
            >
              Save as PDF
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
