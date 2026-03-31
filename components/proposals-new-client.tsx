"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";

function parseProposalPrefill(raw: string): {
  title?: string;
  description?: string;
} | null {
  try {
    const decoded = decodeURIComponent(raw.replace(/\+/g, " "));
    const data = JSON.parse(decoded) as unknown;
    if (data == null || typeof data !== "object" || Array.isArray(data)) {
      return null;
    }
    const o = data as Record<string, unknown>;
    const out: { title?: string; description?: string } = {};
    if (typeof o.title === "string") out.title = o.title;
    if (typeof o.description === "string") out.description = o.description;
    return out;
  } catch {
    return null;
  }
}

export function ProposalsNewClient() {
  const { showToast } = useAppToast();
  const searchParams = useSearchParams();
  const prefillAppliedRef = useRef(false);
  const { profile, loading: roleLoading } = useUserRole();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (prefillAppliedRef.current) return;
    const raw = searchParams.get("prefill")?.trim();
    if (!raw) return;
    prefillAppliedRef.current = true;
    const parsed = parseProposalPrefill(raw);
    if (!parsed) {
      showToast({
        message: "Could not read prefill from link.",
        variant: "error",
      });
      return;
    }
    if (parsed.title !== undefined) setTitle(parsed.title);
    if (parsed.description !== undefined) setDescription(parsed.description);
  }, [searchParams, showToast]);

  if (!roleLoading && !profile) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="dashboard" showTppSubtitle />
        <main className="app-page-shell flex-1 py-16 text-center text-white/60">
          {roleLoading ? "Loading…" : "Sign in to create proposals."}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="dashboard" showTppSubtitle />
      <main className="app-page-shell mx-auto w-full min-w-0 max-w-lg flex-1 px-4 py-6 md:max-w-xl md:py-10">
        <Link
          href="/dashboard"
          className="text-sm text-[#E8C84A] hover:underline"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-white">New proposal</h1>
        <p className="mt-2 text-sm text-white/55">
          Draft title and scope. Refine the text below — assistant prefill only
          runs once when you open this page.
        </p>
        <div className="mt-6 flex flex-col gap-4">
          <label className="block text-xs text-white/55">
            Title
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Proposal title"
            />
          </label>
          <label className="block text-xs text-white/55">
            Description / scope
            <textarea
              rows={8}
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Work scope, pricing notes, client context…"
            />
          </label>
        </div>
      </main>
    </div>
  );
}
