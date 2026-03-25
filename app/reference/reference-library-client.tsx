"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useThemedPageShell } from "@/lib/theme-context";
import { downloadQuickReferencePdf } from "@/lib/reference-card-pdf";
import { QUICK_REFERENCE_CARDS } from "@/lib/reference-quick-cards";
import {
  REFERENCE_CHEAT_SHEET_HITS,
  REFERENCE_QUICK_CARD_HITS,
  scoreSearch,
  type ReferenceSearchHit,
} from "@/lib/reference-search-index";
import {
  REFERENCE_DOC_CATEGORIES,
  type ReferenceDocumentRow,
} from "@/lib/reference-doc-types";
import { useUserRole } from "@/hooks/use-user-role";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightMatches(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const terms = [
    ...new Set(
      q
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 1),
    ),
  ];
  if (!terms.length) return text;
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        const isHit = terms.some(
          (t) => part.toLowerCase() === t.toLowerCase(),
        );
        return isHit ? (
          <mark
            key={i}
            className="rounded-sm bg-[#E8C84A]/45 px-0.5 text-[var(--foreground)]"
          >
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        );
      })}
    </>
  );
}

function printRefCard(elementId: string, title: string, note: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title><style>
    body{font-family:system-ui,sans-serif;padding:28px;color:#111;max-width:720px;margin:0 auto;}
    .brand{color:#a88416;font-weight:700;font-size:14px;margin:0 0 8px;}
    h1{font-size:20px;border-bottom:2px solid #c9a227;padding-bottom:10px;color:#0a1628;}
    ul{font-size:13px;line-height:1.55;}
    li{margin:6px 0;}
    footer{margin-top:28px;font-size:11px;color:#555;border-top:1px solid #ddd;padding-top:12px;}
  </style></head><body>
  <p class="brand">TPP Electric — Reference Library</p>
  <h1>${title}</h1>
  ${el.innerHTML}
  <footer><strong>Note:</strong> ${note}<br/>Printed ${new Date().toLocaleString()}</footer>
  </body></html>`);
  w.document.close();
  w.focus();
  w.print();
  w.close();
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  const decimals = i >= 2 ? 2 : i === 1 ? 2 : 0;
  return `${parseFloat(val.toFixed(decimals))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function categoryBadgeClass(cat: ReferenceDocumentRow["category"]): string {
  switch (cat) {
    case "Code":
      return "bg-violet-500/15 text-violet-200 ring-violet-500/40";
    case "Utility":
      return "bg-sky-500/15 text-sky-200 ring-sky-500/40";
    case "Vendor":
      return "bg-amber-500/15 text-amber-200 ring-amber-500/40";
    case "Company":
      return "bg-emerald-500/15 text-emerald-200 ring-emerald-500/40";
    case "Other":
      return "bg-zinc-500/15 text-zinc-200 ring-zinc-500/40";
    default:
      return "bg-white/10 text-white/80 ring-white/20";
  }
}

const CARD_PRINT_NOTE =
  "Field reference — verify NEC, utility specs (e.g. Central Hudson), and AHJ.";

export function ReferenceLibraryClient() {
  const shell = useThemedPageShell();
  const { showToast } = useAppToast();
  const { profile, loading: roleLoading, canManageReferenceDocuments } =
    useUserRole();
  const [documents, setDocuments] = useState<ReferenceDocumentRow[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] =
    useState<ReferenceDocumentRow["category"]>("Code");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [signBusyId, setSignBusyId] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    if (!profile) {
      setDocuments([]);
      setDocsLoading(false);
      return;
    }
    setDocsLoading(true);
    setDocsError(null);
    try {
      const r = await fetch("/api/reference-documents", {
        credentials: "include",
      });
      const j = (await r.json()) as {
        documents?: ReferenceDocumentRow[];
        error?: string;
      };
      if (!r.ok) {
        setDocsError(j.error ?? "Could not load documents.");
        setDocuments([]);
        return;
      }
      setDocuments(j.documents ?? []);
    } catch {
      setDocsError("Could not load documents.");
      setDocuments([]);
    } finally {
      setDocsLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (!roleLoading && profile) void loadDocs();
    if (!roleLoading && !profile) {
      setDocsLoading(false);
      setDocuments([]);
    }
  }, [roleLoading, profile, loadDocs]);

  useEffect(() => {
    const hash = (window.location.hash || "").replace(/^#/, "").trim();
    if (!hash.startsWith("ref-card-")) return;
    const t = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 150);
    return () => window.clearTimeout(t);
  }, []);

  const signAndOpen = useCallback(
    async (doc: ReferenceDocumentRow, mode: "view" | "download") => {
      setSignBusyId(doc.id);
      try {
        const r = await fetch(`/api/reference-documents/${doc.id}/sign`, {
          credentials: "include",
        });
        const j = (await r.json()) as { signedUrl?: string; error?: string };
        if (!r.ok || !j.signedUrl) {
          showToast({
            message: j.error ?? "Could not open document.",
            variant: "error",
          });
          return;
        }
        if (mode === "view") {
          window.open(j.signedUrl, "_blank", "noopener,noreferrer");
        } else {
          const fr = await fetch(j.signedUrl);
          const blob = await fr.blob();
          const safe =
            `${doc.title.replace(/[^\w\s.-]+/g, "").trim() || "reference"}.pdf`;
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = safe.endsWith(".pdf") ? safe : `${safe}.pdf`;
          a.click();
          URL.revokeObjectURL(a.href);
        }
      } catch {
        showToast({ message: "Could not open document.", variant: "error" });
      } finally {
        setSignBusyId(null);
      }
    },
    [showToast],
  );

  const onUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadTitle.trim() || !uploadFile) {
      showToast({ message: "Title and PDF file required.", variant: "error" });
      return;
    }
    setUploadBusy(true);
    try {
      const fd = new FormData();
      fd.set("title", uploadTitle.trim());
      fd.set("category", uploadCategory);
      fd.set("file", uploadFile);
      const r = await fetch("/api/reference-documents", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const j = (await r.json()) as {
        document?: ReferenceDocumentRow;
        error?: string;
      };
      if (!r.ok) {
        showToast({
          message: j.error ?? "Upload failed.",
          variant: "error",
        });
        return;
      }
      showToast({ message: "Document uploaded.", variant: "success" });
      setUploadTitle("");
      setUploadFile(null);
      void loadDocs();
    } catch {
      showToast({ message: "Upload failed.", variant: "error" });
    } finally {
      setUploadBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm("Delete this document from the library?")) return;
    setDeleteBusy(true);
    try {
      const r = await fetch(`/api/reference-documents/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        showToast({ message: j.error ?? "Delete failed.", variant: "error" });
        return;
      }
      showToast({ message: "Document removed.", variant: "success" });
      void loadDocs();
    } catch {
      showToast({ message: "Delete failed.", variant: "error" });
    } finally {
      setDeleteBusy(false);
    }
  };

  const searchResults = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];

    type Scored = { hit: ReferenceSearchHit; score: number };
    const scored: Scored[] = [];

    const pushHits = (hits: ReferenceSearchHit[]) => {
      for (const h of hits) {
        const blob = `${h.title} ${h.subtitle ?? ""} ${h.keywords}`;
        const s = scoreSearch(q, blob);
        if (s > 0) scored.push({ hit: h, score: s });
      }
    };

    pushHits(REFERENCE_CHEAT_SHEET_HITS);
    pushHits(REFERENCE_QUICK_CARD_HITS);

    for (const d of documents) {
      const blob = `${d.title} ${d.category} pdf reference`;
      const s = scoreSearch(q, blob);
      if (s > 0) {
        scored.push({
          hit: {
            kind: "doc",
            title: d.title,
            subtitle: `${d.category} · PDF`,
            keywords: blob,
            documentId: d.id,
          },
          score: s,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }, [searchQuery, documents]);

  const signedIn = Boolean(profile);
  const qTrim = searchQuery.trim();

  return (
    <div className={shell}>
      <WideAppHeader active="reference" showTppSubtitle />

      <main className="app-page-shell mx-auto max-w-4xl flex-1 px-4 py-8 md:py-10">
        <header className="mb-6 border-b border-[var(--border)] pb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-3xl">
            TPP Reference Library
          </h1>
          <p className="mt-2 max-w-2xl text-[var(--foreground-muted)]">
            Quick access to codes, specs, and guides
          </p>
        </header>

        {/* Section 4 — search (top) */}
        <section
          className="mb-10 scroll-mt-24"
          aria-labelledby="ref-search-heading"
        >
          <h2
            id="ref-search-heading"
            className="text-lg font-semibold text-[var(--foreground)]"
          >
            Search
          </h2>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            Document titles, built-in cheat sheets, and quick reference card
            content.
          </p>
          <label className="mt-3 block text-sm">
            <span className="sr-only">Search reference</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reference materials…"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2.5 text-sm text-[var(--foreground)]"
            />
          </label>
          {qTrim ? (
            <ul className="mt-4 space-y-2">
              {searchResults.length === 0 ? (
                <li className="text-sm text-[var(--foreground-muted)]">
                  No matches.
                </li>
              ) : (
                searchResults.map(({ hit }, i) => (
                  <li
                    key={`${hit.title}-${hit.documentId ?? hit.href ?? i}`}
                    className="app-card rounded-lg border px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--foreground)]">
                          {highlightMatches(hit.title, qTrim)}
                        </p>
                        {hit.subtitle ? (
                          <p className="text-xs text-[var(--foreground-muted)]">
                            {highlightMatches(hit.subtitle, qTrim)}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {hit.href ? (
                          <Link
                            href={hit.href}
                            className="text-xs font-semibold text-[#E8C84A] hover:underline"
                          >
                            Go
                          </Link>
                        ) : null}
                        {hit.documentId && signedIn ? (
                          <button
                            type="button"
                            className="text-xs font-semibold text-[#E8C84A] hover:underline"
                            onClick={() => {
                              const doc = documents.find(
                                (x) => x.id === hit.documentId,
                              );
                              if (doc) void signAndOpen(doc, "view");
                            }}
                          >
                            View PDF
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </section>

        {!roleLoading && !signedIn ? (
          <div
            className="app-card mb-8 rounded-xl border border-amber-500/30 bg-amber-950/20 p-5"
            role="status"
          >
            <p className="text-sm text-[var(--foreground)]">
              Sign in with your team account to view uploaded PDFs and download
              them. Search above still includes cheat sheets and quick cards.
            </p>
            <Link
              href="/login"
              className="mt-3 inline-flex rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-semibold text-[#0a1628] hover:bg-[#f0d56e]"
            >
              Sign in
            </Link>
          </div>
        ) : null}

        {/* Section 1 — uploaded documents */}
        <section
          className="mb-10 scroll-mt-24"
          aria-labelledby="ref-uploaded-heading"
        >
          <h2
            id="ref-uploaded-heading"
            className="text-lg font-semibold text-[var(--foreground)]"
          >
            Uploaded documents
          </h2>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            Admin-uploaded PDF references for the team.
          </p>

          {canManageReferenceDocuments ? (
            <form
              onSubmit={(e) => void onUpload(e)}
              className="app-card mt-4 space-y-3 rounded-xl border p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[#E8C84A]/90">
                Admin — upload PDF
              </p>
              <label className="block text-sm">
                <span className="text-[var(--foreground-muted)]">
                  Document title
                </span>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--foreground)]"
                  placeholder="e.g. Central Hudson Blue Book 2026"
                  maxLength={500}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--foreground-muted)]">Category</span>
                <select
                  value={uploadCategory}
                  onChange={(e) =>
                    setUploadCategory(
                      e.target.value as ReferenceDocumentRow["category"],
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--foreground)]"
                >
                  {REFERENCE_DOC_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-[var(--foreground-muted)]">
                  PDF file
                </span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="mt-1 block w-full text-sm text-[var(--foreground-muted)]"
                  onChange={(e) =>
                    setUploadFile(e.target.files?.[0] ?? null)
                  }
                />
              </label>
              <button
                type="submit"
                disabled={uploadBusy}
                className="rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-semibold text-[#0a1628] hover:bg-[#f0d56e] disabled:opacity-50"
              >
                {uploadBusy ? "Uploading…" : "Upload"}
              </button>
            </form>
          ) : null}

          {signedIn && docsLoading ? (
            <p className="app-muted mt-4 text-sm">Loading documents…</p>
          ) : null}
          {signedIn && docsError ? (
            <p className="mt-4 text-sm text-red-300" role="alert">
              {docsError}
            </p>
          ) : null}
          {signedIn && !docsLoading && !docsError && documents.length === 0 ? (
            <p className="app-muted mt-4 text-sm">
              No uploaded documents yet.
              {canManageReferenceDocuments
                ? " Use the form above to add PDFs."
                : ""}
            </p>
          ) : null}
          {signedIn && documents.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {documents.map((d) => (
                <li
                  key={d.id}
                  className="app-card flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--foreground)]">
                      {d.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--foreground-muted)]">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${categoryBadgeClass(d.category)}`}
                      >
                        {d.category}
                      </span>
                      <span>{formatDate(d.created_at)}</span>
                      <span>·</span>
                      <span>{formatFileSize(d.file_size)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={signBusyId === d.id}
                      onClick={() => void signAndOpen(d, "view")}
                      className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-[#E8C84A] hover:bg-white/5 disabled:opacity-50"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      disabled={signBusyId === d.id}
                      onClick={() => void signAndOpen(d, "download")}
                      className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/10 disabled:opacity-50"
                    >
                      Download
                    </button>
                    {canManageReferenceDocuments ? (
                      <button
                        type="button"
                        disabled={deleteBusy}
                        onClick={() => void onDelete(d.id)}
                        className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-950/40 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {/* Section 2 — cheat sheets */}
        <section
          className="mb-10 scroll-mt-24"
          aria-labelledby="ref-cheats-heading"
        >
          <h2
            id="ref-cheats-heading"
            className="text-lg font-semibold text-[var(--foreground)]"
          >
            Built-in cheat sheets
          </h2>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            Quick links into Electrical Reference or NEC Checker.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {REFERENCE_CHEAT_SHEET_HITS.map((h) => (
              <li key={h.href}>
                <Link
                  href={h.href ?? "#"}
                  className="app-card block rounded-xl border p-3 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-[#E8C84A]/35"
                >
                  {h.title}
                  <span className="mt-0.5 block text-xs font-normal text-[var(--foreground-muted)]">
                    {h.subtitle}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Section 3 — quick reference cards */}
        <section
          className="mb-10 scroll-mt-24"
          aria-labelledby="ref-cards-heading"
        >
          <h2
            id="ref-cards-heading"
            className="text-lg font-semibold text-[var(--foreground)]"
          >
            Quick reference cards
          </h2>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            Printable layouts — print or download a PDF copy.
          </p>
          <ul className="mt-4 space-y-4">
            {QUICK_REFERENCE_CARDS.map((c) => (
              <li
                key={c.anchorId}
                id={c.anchorId}
                className="app-card scroll-mt-24 rounded-xl border p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-[var(--foreground)]">
                      {c.title}
                    </h3>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-[var(--foreground-muted)]">
                      {c.lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link
                      href={`#${c.anchorId}`}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"
                    >
                      Jump
                    </Link>
                    <button
                      type="button"
                      onClick={() =>
                        printRefCard(c.printId, c.title, CARD_PRINT_NOTE)
                      }
                      className="rounded-lg border border-[#E8C84A]/50 px-3 py-1.5 text-xs font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/10"
                    >
                      Print
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadQuickReferencePdf({
                          title: c.title,
                          lines: c.lines,
                          footerNote: CARD_PRINT_NOTE,
                          fileSlug: c.pdfSlug,
                        })
                      }
                      className="rounded-lg bg-[#E8C84A] px-3 py-1.5 text-xs font-semibold text-[#0a1628] hover:bg-[#f0d56e]"
                    >
                      Download PDF
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="relative -z-10 h-0 overflow-hidden" aria-hidden>
            {QUICK_REFERENCE_CARDS.map((c) => (
              <div key={c.printId} id={c.printId} className="text-black">
                <ul className="list-disc space-y-1 pl-5">
                  {c.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
