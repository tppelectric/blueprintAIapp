"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ToolPageHeader } from "@/components/tool-page-header";
import { ProjectBreakdownEditor } from "@/components/project-breakdown-editor";
import { LinkToJobDialog } from "@/components/link-to-job-dialog";
import {
  defaultProjectBreakdownState,
  type PBLaborLine,
  type PBMaterialLine,
  type ProjectBreakdownState,
} from "@/lib/project-breakdown";
import { createBrowserClient } from "@/lib/supabase/client";

export function ProjectBreakdownPageClient() {
  const [title, setTitle] = useState("Project breakdown");
  const [state, setState] = useState<ProjectBreakdownState>(
    defaultProjectBreakdownState(),
  );
  const [savedId, setSavedId] = useState<string | null>(null);
  const [loadId, setLoadId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const id = p.get("id");
    if (!id) return;
    void (async () => {
      try {
        const supabase = createBrowserClient();
        const { data, error } = await supabase
          .from("project_breakdowns")
          .select("id,name,state_json")
          .eq("id", id)
          .maybeSingle();
        if (error || !data) {
          setMsg("Could not load saved breakdown.");
          return;
        }
        setSavedId(data.id);
        setTitle(data.name || "Project breakdown");
        const raw = data.state_json as unknown;
        if (raw && typeof raw === "object") {
          const o = raw as Record<string, unknown>;
          const base = defaultProjectBreakdownState();
          setState({
            ...base,
            ...o,
            materials: Array.isArray(o.materials)
              ? (o.materials as PBMaterialLine[])
              : base.materials,
            labor: Array.isArray(o.labor)
              ? (o.labor as PBLaborLine[])
              : base.labor,
          });
        }
        setMsg("Loaded saved breakdown.");
      } catch {
        setMsg("Could not load saved breakdown.");
      }
    })();
  }, []);

  const saveToSupabase = useCallback(async () => {
    setSaving(true);
    setMsg(null);
    try {
      const supabase = createBrowserClient();
      const row = {
        name: title.trim() || "Project breakdown",
        state_json: state as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      };
      if (savedId) {
        const { error } = await supabase
          .from("project_breakdowns")
          .update(row)
          .eq("id", savedId);
        if (error) throw error;
        setMsg("Saved.");
      } else {
        const { data, error } = await supabase
          .from("project_breakdowns")
          .insert(row)
          .select("id")
          .single();
        if (error) throw error;
        if (data?.id) {
          setSavedId(data.id);
          const url = new URL(window.location.href);
          url.searchParams.set("id", data.id);
          window.history.replaceState({}, "", url.toString());
        }
        setMsg("Saved as new breakdown.");
      }
    } catch (e) {
      setMsg(
        e instanceof Error
          ? e.message
          : "Save failed. Run Supabase SQL for project_breakdowns.",
      );
    } finally {
      setSaving(false);
    }
  }, [savedId, state, title]);

  return (
    <div className="flex min-h-screen flex-col">
      <ToolPageHeader
        title="Project breakdown"
        subtitle="Standalone cost / price / markup / profit planner"
      >
        <div className="flex flex-wrap gap-2">
          <Link
            href="/tools"
            className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/5"
          >
            ← Tools
          </Link>
          <button
            type="button"
            onClick={() => setLinkOpen(true)}
            className="rounded-lg border border-sky-500/45 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/25"
          >
            Link to job
          </button>
        </div>
      </ToolPageHeader>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 sm:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <label className="block flex-1 text-sm text-white/70">
            Breakdown name
            <input
              className="mt-1 w-full max-w-md rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-white"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveToSupabase()}
              className="rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-semibold text-[#0a1628] disabled:opacity-50"
            >
              {saving ? "Saving…" : savedId ? "Save" : "Save to database"}
            </button>
            <input
              className="w-40 rounded-lg border border-white/15 bg-[#0a1628] px-2 py-2 text-sm text-white"
              placeholder="Load ID (UUID)"
              value={loadId}
              onChange={(e) => setLoadId(e.target.value)}
            />
            <button
              type="button"
              className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white hover:bg-white/5"
              onClick={() => {
                if (!loadId.trim()) return;
                window.location.href = `/tools/project-breakdown?id=${encodeURIComponent(loadId.trim())}`;
              }}
            >
              Load
            </button>
          </div>
        </div>
        {msg ? (
          <p className="mb-4 text-sm text-white/75">{msg}</p>
        ) : null}

        <ProjectBreakdownEditor
          variant="full"
          state={state}
          onChange={setState}
          projectTitle={title}
        />
      </main>

      <LinkToJobDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        attachmentType="project_breakdown"
        attachmentId={savedId}
        attachmentLabel={title}
      />
    </div>
  );
}
