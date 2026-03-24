"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Hit = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  category: string;
};

function categoryIcon(c: string): string {
  switch (c) {
    case "nec":
      return "§";
    case "wire":
    case "conduit":
    case "reference":
      return "⚡";
    case "job":
      return "📋";
    case "customer":
      return "👤";
    case "project":
      return "📐";
    default:
      return "🔧";
  }
}

export function GlobalNavSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const runSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/global-search?q=${encodeURIComponent(query.trim())}`,
      );
      const json = (await res.json()) as { results?: Hit[] };
      setHits(json.results ?? []);
    } catch {
      setHits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void runSearch(q), 200);
    return () => clearTimeout(t);
  }, [q, runSearch]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <label className="sr-only" htmlFor="global-nav-search-input">
        Search tools, NEC, jobs
      </label>
      <input
        id="global-nav-search-input"
        type="search"
        autoComplete="off"
        placeholder="Search NEC, tools, jobs…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="app-nav-search-input w-full min-w-[10rem] max-w-xs rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#E8C84A]/50 sm:max-w-md"
      />
      {open && q.trim().length >= 2 ? (
        <div
          className="app-nav-search-dropdown absolute right-0 z-50 mt-1 max-h-80 w-[min(100vw-2rem,22rem)] overflow-auto rounded-xl border py-1 shadow-lg sm:left-0 sm:w-full sm:max-w-md"
          role="listbox"
        >
          {loading ? (
            <div className="px-3 py-2 text-sm opacity-70">Searching…</div>
          ) : hits.length === 0 ? (
            <div className="px-3 py-2 text-sm opacity-70">No results</div>
          ) : (
            hits.map((h) => (
              <button
                key={h.id}
                type="button"
                role="option"
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => {
                  setOpen(false);
                  setQ("");
                  router.push(h.href);
                }}
              >
                <span className="shrink-0 font-mono text-xs text-[#E8C84A]">
                  {categoryIcon(h.category)}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{h.title}</span>
                  {h.subtitle ? (
                    <span className="block truncate text-xs opacity-65">
                      {h.subtitle}
                    </span>
                  ) : null}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
