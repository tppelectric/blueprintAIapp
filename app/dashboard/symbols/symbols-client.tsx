"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import type { SymbolLibraryRow } from "@/lib/symbol-library-types";

type ProjectRow = {
  id: string;
  project_name: string | null;
  file_name: string;
};

export function SymbolsClient() {
  const [symbols, setSymbols] = useState<SymbolLibraryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [pickProjectId, setPickProjectId] = useState<Record<string, string>>(
    {},
  );

  const loadSymbols = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/symbol-library");
      const json = (await res.json()) as {
        symbols?: SymbolLibraryRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not load library.");
      setSymbols(json.symbols ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed.");
      setSymbols([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const supabase = createBrowserClient();
      const { data, error: qError } = await supabase
        .from("projects")
        .select("id, project_name, file_name")
        .order("created_at", { ascending: false });
      if (qError) {
        setProjects([]);
        return;
      }
      setProjects((data ?? []) as ProjectRow[]);
    } catch {
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    void loadSymbols();
    void loadProjects();
  }, [loadSymbols, loadProjects]);

  const importToProject = useCallback(
    async (libraryId: string) => {
      const projectId = pickProjectId[libraryId]?.trim();
      if (!projectId) {
        window.alert("Choose a project first.");
        return;
      }
      setImportingId(libraryId);
      try {
        const res = await fetch("/api/symbol-library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "importToProject",
            libraryId,
            projectId,
          }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Import failed.");
        window.alert("Symbol added to project legend. Open the project to see it.");
        void loadSymbols();
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Import failed.");
      } finally {
        setImportingId(null);
      }
    },
    [pickProjectId, loadSymbols],
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-white/10 bg-[#071422]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 sm:px-8">
          <Link
            href="/dashboard"
            className="text-lg font-semibold tracking-tight text-white transition-opacity hover:opacity-90"
          >
            ← Dashboard
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium text-white/75">
            <Link href="/upload" className="transition-colors hover:text-white">
              Upload
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 sm:py-12">
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Symbol library
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">
          Captured legend symbols you can reuse across projects. Import into a
          project to pre-populate the symbol legend before scanning.
        </p>

        {loading && (
          <p className="mt-10 text-sm text-white/55" role="status">
            Loading…
          </p>
        )}
        {!loading && error && (
          <p
            className="mt-8 rounded-xl border border-red-500/35 bg-red-950/35 px-4 py-3 text-sm text-red-100"
            role="alert"
          >
            {error}
          </p>
        )}
        {!loading && !error && symbols.length === 0 && (
          <p className="mt-10 text-sm text-white/55">
            No library symbols yet. Capture symbols from a project viewer and use
            &quot;Save to library&quot; after capture, or create entries via the
            API.
          </p>
        )}
        {!loading && !error && symbols.length > 0 && (
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {symbols.map((s) => {
              const img = s.symbol_image_base64?.trim();
              const projectCount = s.project_ids?.length ?? 0;
              const busy = importingId === s.id;
              return (
                <li
                  key={s.id}
                  className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <div className="mb-3 flex min-h-[100px] items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white p-2">
                    {img ? (
                      <img
                        src={`data:image/png;base64,${img}`}
                        alt=""
                        className="max-h-24 w-full object-contain"
                      />
                    ) : (
                      <span className="text-xs text-white/40">No image</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-white">
                    {s.description}
                  </p>
                  <p className="mt-1 text-xs text-white/55">
                    {s.category.replace(/_/g, " ")}
                  </p>
                  <p className="mt-2 text-xs tabular-nums text-white/50">
                    Used {s.usage_count} time
                    {s.usage_count === 1 ? "" : "s"}
                    {projectCount > 0
                      ? ` · ${projectCount} project${projectCount === 1 ? "" : "s"}`
                      : ""}
                  </p>
                  <div className="mt-4 flex min-w-0 flex-col gap-2">
                    <label className="text-[11px] font-medium text-white/60">
                      Use in new project
                      <select
                        value={pickProjectId[s.id] ?? ""}
                        disabled={busy || projects.length === 0}
                        onChange={(e) =>
                          setPickProjectId((prev) => ({
                            ...prev,
                            [s.id]: e.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-white/20 bg-[#0a1628] px-2 py-1.5 text-sm text-white"
                      >
                        <option value="">Select project…</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.project_name?.trim() ||
                              p.file_name.replace(/\.pdf$/i, "")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={busy || projects.length === 0}
                      onClick={() => void importToProject(s.id)}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-45"
                    >
                      {busy ? "Importing…" : "Import to project"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
