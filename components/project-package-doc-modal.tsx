"use client";

import { useCallback, useMemo, useState } from "react";
import type { GeneratedProjectPackage } from "@/lib/project-describer-types";
import { TPP_COMPANY_FULL } from "@/lib/tpp-branding";

const TABS = [
  { id: "scope", label: "Work scope" },
  { id: "field", label: "Field work order" },
  { id: "proposal", label: "Client proposal" },
  { id: "bom", label: "Bill of materials" },
  { id: "labor", label: "Labor estimate" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ProjectPackageDocModal({
  open,
  onClose,
  pkg,
}: {
  open: boolean;
  onClose: () => void;
  pkg: GeneratedProjectPackage | null;
}) {
  const [tab, setTab] = useState<TabId>("scope");
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  const body = useMemo(() => {
    if (!pkg) return "";
    switch (tab) {
      case "scope":
        return pkg.internalWorkScope;
      case "field":
        return pkg.fieldWorkOrder;
      case "proposal":
        return pkg.clientProposal;
      case "bom":
        return pkg.billOfMaterials;
      case "labor":
        return pkg.laborEstimate;
      default:
        return "";
    }
  }, [pkg, tab]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(body);
      setCopyMsg("Copied.");
      setTimeout(() => setCopyMsg(null), 2000);
    } catch {
      setCopyMsg("Copy failed");
    }
  }, [body]);

  const printDoc = useCallback(() => {
    const w = window.open("", "_blank", "width=900,height=1200");
    if (!w) return;
    const d = w.document;
    d.write(
      `<!DOCTYPE html><html><head><title>${TPP_COMPANY_FULL} — Document</title>`,
    );
    d.write(
      "<style>body{font-family:system-ui,sans-serif;white-space:pre-wrap;padding:28px;color:#111;font-size:12px;line-height:1.5;max-width:48rem;margin:0 auto;} h1{font-size:14px;color:#0a1628;border-bottom:2px solid #E8C84A;padding-bottom:8px}</style>",
    );
    d.write("</head><body>");
    d.write(`<h1>${TPP_COMPANY_FULL}</h1><pre style="white-space:pre-wrap;font:inherit">`);
    d.write(
      body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
    );
    d.write("</pre></body></html>");
    d.close();
    w.focus();
    w.print();
  }, [body]);

  if (!open || !pkg) return null;

  return (
    <div
      className="fixed inset-0 z-[240] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Generated documents"
    >
      <div className="flex max-h-[min(92vh,900px)] w-full max-w-3xl flex-col rounded-2xl border border-white/15 bg-[#0a1628] shadow-2xl">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <h2 className="text-lg font-semibold text-white">Project package</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
          >
            Close
          </button>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1 border-b border-white/10 px-2 py-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-200",
                tab === t.id
                  ? "bg-[#E8C84A]/20 text-[#E8C84A]"
                  : "text-white/65 hover:bg-white/10 hover:text-white",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-white/85">
            {body}
          </pre>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={() => void copy()}
            className="rounded-lg border border-[#E8C84A]/45 bg-[#E8C84A]/10 px-3 py-2 text-xs font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/20"
          >
            Copy section
          </button>
          <button
            type="button"
            onClick={printDoc}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
          >
            Print / Save PDF
          </button>
          {copyMsg ? (
            <span className="self-center text-xs text-emerald-300">{copyMsg}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
