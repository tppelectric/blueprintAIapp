"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ElectricalItemRow } from "@/lib/electrical-item-types";
import type { DetectedRoomRow } from "@/lib/detected-room-types";
import { createBrowserClient } from "@/lib/supabase/client";
import { buildProjectBreakdownFromTakeoffItems } from "@/lib/takeoff-materials-breakdown";
import {
  inferTakeoffBucket,
  itemMatchesTakeoffTab,
  TAKEOFF_TAB_META,
  type TakeoffFilterTab,
} from "@/lib/takeoff-category";
import {
  pushTakeoffToAvAnalyzer,
  pushTakeoffToElectricalAnalyzer,
  pushTakeoffToLoadCalculator,
  pushTakeoffToNecChecker,
  pushTakeoffToSmartHomeAnalyzer,
  takeoffHasAvSignals,
  takeoffHasSmartHomeSignals,
} from "@/lib/takeoff-send-tools";
import {
  displayWhichRoom,
  isItemUnassignedForPage,
  itemMatchesDetectedRoom,
  normalizeRoomLabel,
} from "@/lib/room-item-match";

const ITEM_DRAG_MIME = "application/x-blueprint-item";

function suggestedRoomOptionsForItem(
  item: ElectricalItemRow,
  options: AssignableRoomOption[],
  limit = 3,
): AssignableRoomOption[] {
  const desc =
    `${item.description} ${item.specification ?? ""} ${item.which_room ?? ""}`.toLowerCase();
  const scored = options.map((o) => {
    const name = o.room_name.toLowerCase();
    let score = 0;
    if (desc.includes(name)) score += 6;
    const words = name.split(/\s+/).filter((w) => w.length > 2);
    for (const w of words) {
      if (desc.includes(w)) score += 2;
    }
    return { o, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const positive = scored.filter((s) => s.score > 0).map((s) => s.o);
  const picked = positive.slice(0, limit);
  if (picked.length >= limit) return picked;
  const rest = options.filter((o) => !picked.includes(o));
  return [...picked, ...rest.slice(0, limit - picked.length)];
}

/** Value for room `<select>`: room option id, UNASSIGNED, or "" if current label not in list. */
function roomSelectValueForItem(
  item: ElectricalItemRow,
  options: AssignableRoomOption[],
): string {
  const w = normalizeRoomLabel(displayWhichRoom(item));
  if (w === "" || w === "UNASSIGNED") return "__UNASSIGNED__";
  const hit = options.find(
    (o) => normalizeRoomLabel(o.room_name) === w,
  );
  return hit?.id ?? "";
}

export type { ElectricalItemRow };

const CATEGORY_OPTIONS: { value: ElectricalItemRow["category"]; label: string }[] =
  [
    { value: "fixture", label: "Fixture" },
    { value: "panel", label: "Panel" },
    { value: "wiring", label: "Wiring" },
    { value: "plan_note", label: "Plan note" },
  ];

function confidenceDotClass(confidence: number): string {
  if (confidence >= 0.9) return "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]";
  if (confidence >= 0.7) return "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]";
  return "bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.55)]";
}

function formatSq(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n >= 1000 ? n.toLocaleString("en-US") : String(Math.round(n));
}

/** Unique id per room; labels dedupe duplicate blueprint names for UI (STORAGE, STORAGE (2), …). */
type AssignableRoomOption = {
  id: string;
  label: string;
  /** Value stored on `electrical_items.which_room` (matches `detected_rooms.room_name`). */
  room_name: string;
};

function assignableRoomOptionsWithDisambiguatedLabels(
  rooms: DetectedRoomRow[],
): AssignableRoomOption[] {
  const usage = new Map<string, number>();
  return rooms.map((r) => {
    const base = r.room_name.trim() || "Room";
    const next = (usage.get(base) ?? 0) + 1;
    usage.set(base, next);
    const label = next === 1 ? base : `${base} (${next})`;
    return { id: r.id, label, room_name: r.room_name };
  });
}

function roomFootprint(r: DetectedRoomRow): number | null {
  const w = r.width_ft != null ? Number(r.width_ft) : null;
  const len = r.length_ft != null ? Number(r.length_ft) : null;
  if (w != null && len != null && w > 0 && len > 0) return w * len;
  if (r.sq_ft != null) {
    const s = Number(r.sq_ft);
    return Number.isFinite(s) && s > 0 ? s : null;
  }
  return null;
}

type VerifyUi = "unverified" | "confirmed" | "verify_needed" | "conflict";

function verifyState(
  claude: number,
  gpt: number | null,
  dbStatus: string | null | undefined,
): VerifyUi {
  const s = dbStatus ?? "pending";
  if (s === "confirmed" || s === "manual") return "confirmed";
  if (gpt === null) return "unverified";
  const diff = Math.abs(claude - gpt);
  if (diff === 0) return "confirmed";
  if (diff === 1) return "verify_needed";
  return "conflict";
}

/** During manual mode: preview final = manual clicks if &gt; 0, else AI quantity. */
function effectiveQty(
  item: ElectricalItemRow,
  manualCounts: Record<string, number>,
  manualMode: boolean,
): number {
  if (manualMode) {
    const m = Math.round(Number(manualCounts[item.id] ?? 0));
    const ai = Math.round(Number(item.quantity));
    return m > 0 ? m : ai;
  }
  if (item.final_count != null) return Math.round(Number(item.final_count));
  return Math.round(Number(item.quantity));
}

function verificationBreakdown(items: ElectricalItemRow[]) {
  let accepted = 0;
  let override = 0;
  let manual = 0;
  let unverified = 0;
  let conflict = 0;
  let total = 0;
  for (const i of items) {
    if (i.category === "plan_note") continue;
    total++;
    const st = i.verification_status ?? "pending";
    const vb = i.verified_by ?? null;
    if (st === "conflict") {
      conflict++;
      continue;
    }
    if (st === "manual") {
      manual++;
      continue;
    }
    if (vb === "override") {
      override++;
      continue;
    }
    if (vb === "accept" || vb === "resolve") {
      accepted++;
      continue;
    }
    if (st === "confirmed") {
      accepted++;
      continue;
    }
    unverified++;
  }
  return {
    total,
    verifiedCount: accepted + override + manual,
    accepted,
    override,
    manual,
    unverified,
    conflict,
  };
}

function ItemVerificationBadge({ item }: { item: ElectricalItemRow }) {
  const claudeQty = Math.round(Number(item.quantity));
  const gptQty =
    item.gpt_count != null ? Math.round(Number(item.gpt_count)) : null;
  const status = item.verification_status ?? "pending";
  const vb = item.verified_by ?? null;

  if (status === "conflict") {
    return (
      <span className="shrink-0 rounded border border-red-500/40 bg-red-950/35 px-1.5 py-0.5 text-[9px] font-semibold text-red-100">
        ⚠️ Conflict
      </span>
    );
  }
  if (status === "manual") {
    const x = Math.round(Number(item.final_count ?? claudeQty));
    return (
      <span className="shrink-0 rounded border border-sky-500/45 bg-sky-950/40 px-1.5 py-0.5 text-[9px] font-semibold text-sky-100">
        👆 Verified: {x}
      </span>
    );
  }
  if (vb === "override") {
    const x = Math.round(Number(item.final_count ?? claudeQty));
    return (
      <span className="shrink-0 rounded border border-amber-500/50 bg-amber-950/40 px-1.5 py-0.5 text-[9px] font-semibold text-amber-100">
        ✏️ Override: {x}
      </span>
    );
  }
  if (
    vb === "accept" ||
    vb === "resolve" ||
    (status === "confirmed" && vb !== "override")
  ) {
    return (
      <span className="shrink-0 rounded border border-emerald-500/45 bg-emerald-950/40 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-100">
        ✅ Accepted
      </span>
    );
  }
  const vs = verifyState(claudeQty, gptQty, status);
  if (vs === "verify_needed") {
    return (
      <span className="shrink-0 rounded border border-amber-500/35 bg-amber-950/30 px-1.5 py-0.5 text-[9px] font-semibold text-amber-100">
        🤖 Verify AI/GPT
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-white/65">
      🤖 AI Only
    </span>
  );
}

function CompactItemRow({
  item,
  manualMode,
  manualCount,
  selectedManualItemId,
  onSelectManualItem,
  onManualCountDelta,
  onResetManualItemToAi,
  onAcceptGpt,
  onPatchItems,
  assignableRoomOptions,
  onAssigned,
  roomSelectEnabled,
  dragEnabled,
  onDragItemChange,
  showBulkCheckbox,
  bulkChecked,
  onBulkToggle,
  quickSuggestRooms,
  manualCompareHint,
  onDismissManualCompare,
  onKeepAiCount,
  forceOverrideOpen = false,
  onRequestVerify,
}: {
  item: ElectricalItemRow;
  manualMode: boolean;
  manualCount: number | undefined;
  selectedManualItemId: string | null;
  onSelectManualItem: (id: string) => void;
  onManualCountDelta: (id: string, delta: number) => void;
  onResetManualItemToAi: (id: string) => void;
  onAcceptGpt: (id: string) => void;
  onPatchItems: (updates: ElectricalItemRow[]) => void;
  assignableRoomOptions?: AssignableRoomOption[];
  onAssigned?: () => void;
  roomSelectEnabled?: boolean;
  dragEnabled?: boolean;
  onDragItemChange?: (itemId: string | null) => void;
  showBulkCheckbox?: boolean;
  bulkChecked?: boolean;
  onBulkToggle?: () => void;
  quickSuggestRooms?: AssignableRoomOption[];
  /** After manual save: show AI vs final comparison + actions */
  manualCompareHint?: boolean;
  onDismissManualCompare?: (itemId: string) => void;
  onKeepAiCount?: (itemId: string) => void;
  /** Room bulk action: show override inputs for every item in the room */
  forceOverrideOpen?: boolean;
  onRequestVerify?: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(item.description);
  const [saving, setSaving] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideDraft, setOverrideDraft] = useState("");

  useEffect(() => {
    if (!editingName) setDraftName(item.description);
  }, [item.description, editingName]);

  const claudeQty = Math.round(Number(item.quantity));
  const gptQty =
    item.gpt_count != null ? Math.round(Number(item.gpt_count)) : null;

  useEffect(() => {
    if (forceOverrideOpen) {
      setOverrideOpen(true);
      setOverrideDraft(
        String(item.final_count ?? (gptQty ?? claudeQty)),
      );
    } else {
      setOverrideOpen(false);
    }
  }, [
    forceOverrideOpen,
    item.id,
    item.final_count,
    item.quantity,
    item.gpt_count,
    gptQty,
    claudeQty,
  ]);

  const status = item.verification_status ?? "pending";
  const vState = verifyState(claudeQty, gptQty, status);
  const showManual = manualMode;
  const manualClickCount = Math.round(Number(manualCount ?? 0));
  const finalPreview =
    showManual && item.category !== "plan_note"
      ? manualClickCount > 0
        ? manualClickCount
        : claudeQty
      : item.final_count != null
        ? Math.round(Number(item.final_count))
        : claudeQty;
  /** Center number for [−] [+]: manual clicks only while counting */
  const manualStepperShown = showManual ? manualClickCount : finalPreview;
  const isSelected = selectedManualItemId === item.id && showManual;

  const saveName = async (nextName: string, nextCategory: string) => {
    const desc = nextName.trim();
    if (!desc) return;
    setSaving(true);
    try {
      const res = await fetch("/api/electrical-items/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          description: desc,
          category: nextCategory,
        }),
      });
      const json = (await res.json()) as {
        item?: ElectricalItemRow;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Save failed.");
      if (json.item) onPatchItems([json.item]);
      setEditingName(false);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const acceptVerified = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/electrical-items/accept-verified", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      const json = (await res.json()) as {
        item?: ElectricalItemRow;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Accept failed.");
      if (json.item) onPatchItems([json.item]);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not accept.");
    } finally {
      setSaving(false);
    }
  };

  const submitOverride = async () => {
    const n = Math.round(Number(overrideDraft));
    if (!Number.isFinite(n) || n < 0) {
      window.alert("Enter a non-negative whole number.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/electrical-items/set-final", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, finalCount: n }),
      });
      const json = (await res.json()) as {
        item?: ElectricalItemRow;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Save failed.");
      if (json.item) onPatchItems([json.item]);
      setOverrideOpen(false);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const assignRoom = async (roomName: string) => {
    if (!roomName) return;
    setSaving(true);
    try {
      const res = await fetch("/api/electrical-items/assign-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, whichRoom: roomName }),
      });
      const json = (await res.json()) as {
        item?: ElectricalItemRow;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Assign failed.");
      if (json.item) onPatchItems([json.item]);
      onAssigned?.();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Assign failed.");
    } finally {
      setSaving(false);
    }
  };

  const roomOpts = assignableRoomOptions ?? [];
  const showRoomSelect =
    Boolean(roomSelectEnabled && roomOpts.length > 0);
  const roomSelVal = showRoomSelect
    ? roomSelectValueForItem(item, roomOpts)
    : "";

  return (
    <div
      className={[
        "rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-xs transition-colors",
        isSelected ? "border-sky-400 ring-1 ring-sky-400/50" : "",
        dragEnabled ? "cursor-default" : "",
      ].join(" ")}
      onClick={() => {
        if (showManual) onSelectManualItem(item.id);
      }}
      role={showManual ? "button" : undefined}
    >
      <div
        className="flex flex-wrap items-start gap-2 border-b border-white/5 pb-2"
        onClick={(e) => e.stopPropagation()}
      >
        {dragEnabled ? (
          <span
            role="button"
            tabIndex={0}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(ITEM_DRAG_MIME, item.id);
              e.dataTransfer.effectAllowed = "move";
              onDragItemChange?.(item.id);
            }}
            onDragEnd={() => onDragItemChange?.(null)}
            className="mt-0.5 cursor-grab touch-none select-none text-sm leading-none text-white/35 hover:text-cyan-300/90 active:cursor-grabbing"
            aria-label="Drag to move to another room"
            title="Drag into a room"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") e.preventDefault();
            }}
          >
            ⣿
          </span>
        ) : null}
        {showBulkCheckbox ? (
          <input
            type="checkbox"
            checked={bulkChecked ?? false}
            onChange={() => onBulkToggle?.()}
            className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-white/30 bg-[#0a1628]"
            aria-label={`Select ${item.description}`}
            onClick={(e) => e.stopPropagation()}
          />
        ) : null}
        <span
          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${confidenceDotClass(item.confidence)}`}
          title={`Confidence ${Math.round(item.confidence * 100)}%`}
        />
        <div className="min-w-0 flex-1 basis-[10rem]">
          {editingName ? (
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveName(draftName, item.category);
                if (e.key === "Escape") {
                  setDraftName(item.description);
                  setEditingName(false);
                }
              }}
              disabled={saving}
              className="w-full rounded border border-sky-500/40 bg-[#0a1628] px-1.5 py-0.5 text-xs font-medium text-white"
              autoFocus
            />
          ) : (
            <button
              type="button"
              className="text-left font-medium text-white hover:text-sky-200"
              onClick={() => {
                setDraftName(item.description);
                setEditingName(true);
              }}
            >
              {item.description}
            </button>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-[10px] tabular-nums">
          <span
            className="rounded bg-white/[0.06] px-1.5 py-0.5 font-medium text-white/90"
            title="AI-detected count"
          >
            AI: <span className="font-bold text-white">{claudeQty}</span>
            {gptQty !== null && gptQty !== claudeQty ? (
              <span className="text-violet-300"> ({gptQty} GPT)</span>
            ) : null}
          </span>
          <span
            className="rounded bg-white/[0.06] px-1.5 py-0.5 font-medium text-sky-200/90"
            title={
              showManual
                ? "Clicks on blueprint this session"
                : "Saved manual count (after verify)"
            }
          >
            Manual:{" "}
            <span className="font-bold text-white">
              {showManual && item.category !== "plan_note"
                ? manualClickCount
                : item.verification_status === "manual"
                  ? Math.round(Number(item.final_count ?? 0))
                  : "—"}
            </span>
          </span>
          <ItemVerificationBadge item={item} />
        </div>
      </div>
      {item.category !== "plan_note" ? (
        <div
          className="mt-2 flex flex-wrap gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            disabled={saving}
            onClick={() => void acceptVerified()}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/50 bg-emerald-800/35 px-2.5 py-1.5 text-[11px] font-bold text-emerald-50 hover:bg-emerald-800/50 disabled:opacity-40"
            title="Accept AI count as final verified"
          >
            ✅ Accept
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setOverrideDraft(
                String(item.final_count ?? gptQty ?? claudeQty),
              );
              setOverrideOpen((o) => !o);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-500/45 bg-amber-950/40 px-2.5 py-1.5 text-[11px] font-bold text-amber-100 hover:bg-amber-950/55 disabled:opacity-40"
            title="Type the correct count"
          >
            ✏️ Override
          </button>
          {onRequestVerify ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => onRequestVerify()}
              className="inline-flex items-center gap-1 rounded-lg border border-sky-500/45 bg-sky-950/40 px-2.5 py-1.5 text-[11px] font-bold text-sky-100 hover:bg-sky-950/55 disabled:opacity-40"
              title="Click-to-count on blueprint for this item"
            >
              👆 Verify
            </button>
          ) : null}
        </div>
      ) : null}
      {showManual && item.category !== "plan_note" ? (
        <div
          className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-white/5 pt-2"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="mr-auto text-[10px] text-white/50">
            Session:{" "}
            <span className="font-semibold text-emerald-200/90">
              Final preview {finalPreview}
            </span>
          </span>
          <button
            type="button"
            aria-label="Decrease"
            onClick={() => onManualCountDelta(item.id, -1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white"
          >
            −
          </button>
          <span className="min-w-[2.25rem] text-center text-sm font-bold text-white">
            {manualStepperShown}
          </span>
          <button
            type="button"
            aria-label="Increase"
            onClick={() => onManualCountDelta(item.id, 1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white"
          >
            +
          </button>
        </div>
      ) : null}
      {manualCompareHint && item.category !== "plan_note" ? (
        <div
          className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-amber-500/30 bg-amber-950/25 px-2 py-1.5 text-[10px] text-amber-50/95"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-white/85">
            AI: <span className="font-semibold tabular-nums">{claudeQty}</span>
          </span>
          <span className="text-white/35">|</span>
          <span>
            Manual / Final:{" "}
            <span className="font-semibold tabular-nums text-white">
              {Math.round(Number(item.final_count ?? claudeQty))}
            </span>
          </span>
          <span className="text-white/35">|</span>
          <span className="text-amber-200">
            ⚠️ Difference:{" "}
            {(() => {
              const f = Math.round(Number(item.final_count ?? claudeQty));
              const d = f - claudeQty;
              return `${d > 0 ? "+" : ""}${d}`;
            })()}
          </span>
          <button
            type="button"
            disabled={saving}
            onClick={() => onKeepAiCount?.(item.id)}
            className="rounded border border-white/25 bg-white/10 px-2 py-0.5 font-semibold text-white hover:bg-white/15 disabled:opacity-40"
          >
            Keep AI
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onDismissManualCompare?.(item.id)}
            className="rounded border border-emerald-500/40 bg-emerald-800/30 px-2 py-0.5 font-semibold text-emerald-100 hover:bg-emerald-800/45 disabled:opacity-40"
          >
            Accept manual
          </button>
        </div>
      ) : null}
      <div
        className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-white/5 pt-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        {showRoomSelect ? (
          <label className="flex min-w-0 items-center gap-1 text-[10px] text-white/60">
            <span className="shrink-0 font-semibold text-cyan-200/80">Room</span>
            <select
              disabled={saving}
              value={roomSelVal === "" ? "" : roomSelVal}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || v === roomSelVal) return;
                if (v === "__UNASSIGNED__") void assignRoom("UNASSIGNED");
                else {
                  const opt = roomOpts.find((o) => o.id === v);
                  if (opt) void assignRoom(opt.room_name);
                }
              }}
              className="max-w-[10rem] rounded border border-cyan-500/40 bg-[#0a1628] px-1 py-0.5 text-[10px] font-medium text-cyan-50"
              title="Change room assignment"
            >
              {roomSelVal === "" ? (
                <option value="">
                  {displayWhichRoom(item)} — pick room…
                </option>
              ) : null}
              <option value="__UNASSIGNED__">UNASSIGNED</option>
              {roomOpts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <select
          value={item.category}
          disabled={saving}
          onChange={(e) => void saveName(item.description, e.target.value)}
          className="max-w-[7rem] rounded border border-white/15 bg-[#0a1628] px-1 py-0.5 text-[10px] text-white"
        >
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {showManual ? (
          <button
            type="button"
            onClick={() => onResetManualItemToAi(item.id)}
            className="text-[10px] text-amber-200/90 hover:underline"
          >
            Clear manual
          </button>
        ) : null}
        {gptQty !== null && status !== "manual" && vState !== "confirmed" ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => onAcceptGpt(item.id)}
            className="text-[10px] text-violet-200 hover:underline"
          >
            Use GPT
          </button>
        ) : null}
      </div>
        {quickSuggestRooms && quickSuggestRooms.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1 border-t border-white/5 pt-1.5">
            <span className="w-full text-[9px] font-semibold uppercase tracking-wide text-white/40">
              Quick assign
            </span>
            {quickSuggestRooms.map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={saving}
                onClick={() => void assignRoom(o.room_name)}
                className="rounded border border-cyan-500/40 bg-cyan-950/40 px-1.5 py-0.5 text-[10px] font-medium text-cyan-100 hover:bg-cyan-900/50 disabled:opacity-40"
              >
                → {o.label}
              </button>
            ))}
          </div>
        ) : null}
        {overrideOpen ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-amber-500/35 bg-amber-950/25 p-2">
            <span className="text-[10px] text-amber-100/90">
              Override (AI stays {claudeQty})
            </span>
            <input
              type="number"
              min={0}
              value={overrideDraft}
              onChange={(e) => setOverrideDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitOverride();
              }}
              className="w-20 rounded border border-white/20 bg-[#0a1628] px-1.5 py-1 text-xs text-white"
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => void submitOverride()}
              className="rounded-lg bg-amber-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-amber-500 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        ) : null}
    </div>
  );
}

function RoomHeader({
  room,
  expanded,
  onToggle,
  deviceTotal,
  onPatchRooms,
  onExportRoom,
  onAcceptAllInRoom,
  onOverrideAllInRoom,
}: {
  room: DetectedRoomRow;
  expanded: boolean;
  onToggle: () => void;
  deviceTotal: number;
  onPatchRooms: (updates: DetectedRoomRow[]) => void;
  onExportRoom?: () => void;
  onAcceptAllInRoom?: () => void;
  onOverrideAllInRoom?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(room.room_name);
  const [saving, setSaving] = useState(false);
  const sq = roomFootprint(room);

  useEffect(() => {
    if (!editing) setDraft(room.room_name);
  }, [room.room_name, editing]);

  const saveName = async () => {
    const n = draft.trim();
    if (!n) return;
    setSaving(true);
    try {
      const res = await fetch("/api/detected-rooms/patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: room.id, room_name: n }),
      });
      const json = (await res.json()) as {
        room?: DetectedRoomRow;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Save failed.");
      if (json.room) onPatchRooms([json.room]);
      setEditing(false);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex w-full items-start gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2.5">
      <span className="text-lg" aria-hidden>
        🏠
      </span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex flex-wrap gap-1">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveName();
                if (e.key === "Escape") {
                  setDraft(room.room_name);
                  setEditing(false);
                }
              }}
              disabled={saving}
              className="w-full rounded border border-cyan-500/40 bg-[#0a1628] px-2 py-1 text-sm font-semibold text-white"
              autoFocus
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveName()}
              className="rounded bg-cyan-600 px-2 py-0.5 text-[10px] text-white"
            >
              Save
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="block w-full text-left text-sm font-bold text-white hover:text-cyan-200"
            onClick={() => setEditing(true)}
          >
            {room.room_name}
          </button>
        )}
        <p className="mt-0.5 text-[11px] text-white/55">
          {sq != null ? `${formatSq(sq)} sq ft` : "—"} · Page {room.page_number}
        </p>
        <p className="mt-1 text-[11px] font-medium text-white/70">
          {deviceTotal} total devices
        </p>
        {onAcceptAllInRoom || onOverrideAllInRoom || onExportRoom ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {onAcceptAllInRoom ? (
              <button
                type="button"
                onClick={onAcceptAllInRoom}
                className="rounded border border-emerald-500/45 bg-emerald-950/35 px-2 py-1 text-[10px] font-semibold text-emerald-100 hover:bg-emerald-950/50"
              >
                Accept All in Room
              </button>
            ) : null}
            {onOverrideAllInRoom ? (
              <button
                type="button"
                onClick={onOverrideAllInRoom}
                className="rounded border border-amber-500/45 bg-amber-950/35 px-2 py-1 text-[10px] font-semibold text-amber-100 hover:bg-amber-950/50"
              >
                Override All
              </button>
            ) : null}
            {onExportRoom ? (
              <button
                type="button"
                onClick={onExportRoom}
                className="rounded border border-cyan-500/40 bg-cyan-950/35 px-2 py-1 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-950/50"
              >
                Export Room
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button
          type="button"
          onClick={onToggle}
          className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse room" : "Expand room"}
        >
          {expanded ? "▼" : "▶"}
        </button>
      </div>
    </div>
  );
}

const SUMMARY_ROWS: {
  tab: TakeoffFilterTab;
  label: string;
  detail: string;
}[] = [
  { tab: "fixtures", label: "Fixtures", detail: "Recessed, fans, sconces" },
  {
    tab: "receptacles",
    label: "Receptacles",
    detail: "Standard, GFCI, dedicated",
  },
  { tab: "switches", label: "Switches", detail: "Single pole, 3-way, dimmer" },
  { tab: "panels", label: "Panels", detail: "Breakers, panels" },
  { tab: "plan_notes", label: "Plan Notes", detail: "Code notes, specs" },
  {
    tab: "low_voltage",
    label: "Low Voltage",
    detail: "TV, data, speakers",
  },
  { tab: "wiring", label: "Wiring", detail: "Homeruns, feeders" },
];

function takeoffBucketCounts(
  items: ElectricalItemRow[],
  manualCounts: Record<string, number>,
  manualMode: boolean,
): Record<TakeoffFilterTab, number> {
  const acc: Record<TakeoffFilterTab, number> = {
    all: 0,
    fixtures: 0,
    receptacles: 0,
    switches: 0,
    panels: 0,
    plan_notes: 0,
    low_voltage: 0,
    wiring: 0,
  };
  for (const item of items) {
    const q = effectiveQty(item, manualCounts, manualMode);
    acc.all += q;
    if (item.category === "plan_note") {
      acc.plan_notes += q;
      continue;
    }
    acc[inferTakeoffBucket(item)] += q;
  }
  return acc;
}

function TakeoffSummaryCollapsible({
  deviceItems,
  planNotes,
  pageRooms,
  manualCounts,
  manualMode,
  expanded,
  onToggleExpanded,
  onExport,
}: {
  deviceItems: ElectricalItemRow[];
  planNotes: ElectricalItemRow[];
  pageRooms: DetectedRoomRow[];
  manualCounts: Record<string, number>;
  manualMode: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onExport?: () => void;
}) {
  const counts = useMemo(
    () => takeoffBucketCounts([...deviceItems, ...planNotes], manualCounts, manualMode),
    [deviceItems, planNotes, manualCounts, manualMode],
  );
  const grandDevices = deviceItems.reduce(
    (s, i) => s + effectiveQty(i, manualCounts, manualMode),
    0,
  );
  const planNoteLines = planNotes.reduce(
    (s, i) => s + effectiveQty(i, manualCounts, manualMode),
    0,
  );
  const grandTotal = grandDevices + planNoteLines;
  const verification = useMemo(
    () => verificationBreakdown([...deviceItems, ...planNotes]),
    [deviceItems, planNotes],
  );

  return (
    <section className="mb-4 rounded-xl border border-[#E8C84A]/35 bg-[#050d18] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <span className="text-white/50" aria-hidden>
            {expanded ? "▼" : "▶"}
          </span>
          <span className="text-sm font-semibold text-[#E8C84A]">
            Takeoff Summary — {deviceItems.length + planNotes.length} item
            {deviceItems.length + planNotes.length === 1 ? "" : "s"} |{" "}
            {pageRooms.length} room{pageRooms.length === 1 ? "" : "s"}
          </span>
        </button>
        {onExport ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExport();
            }}
            className="shrink-0 rounded-lg border border-emerald-500/45 bg-emerald-950/40 px-2.5 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-950/55"
          >
            Export
          </button>
        ) : null}
      </div>
      {expanded ? (
        <div className="px-3 py-3">
          <div className="mb-3 rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-2 text-[11px] leading-relaxed text-white/85">
            <p className="font-semibold text-white">
              Verified items: {verification.verifiedCount} / {verification.total}{" "}
              total
            </p>
            <p className="mt-1 text-white/65">
              Accepted: {verification.accepted} | Override:{" "}
              {verification.override} | Manual: {verification.manual} | Unverified:{" "}
              {verification.unverified}
              {verification.conflict > 0
                ? ` | Conflict: ${verification.conflict}`
                : ""}
            </p>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-xs sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <span className="font-semibold uppercase tracking-wide text-white/50">
              Category
            </span>
            <span className="text-right font-semibold text-white/50">Count</span>
            <span className="hidden font-semibold text-white/50 sm:block">
              Details
            </span>
            {SUMMARY_ROWS.map((row) => (
              <div key={row.tab} className="contents">
                <span className="text-white/90">{row.label}</span>
                <span className="text-right tabular-nums font-medium text-white">
                  {counts[row.tab]}
                </span>
                <span className="hidden text-white/55 sm:block">{row.detail}</span>
              </div>
            ))}
          </div>
          <div className="my-3 border-t border-white/15" />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-white">
            <span>Grand total (qty)</span>
            <span className="tabular-nums text-[#E8C84A]">{grandTotal}</span>
          </div>
          <button
            type="button"
            onClick={onToggleExpanded}
            className="mt-3 w-full rounded-lg border border-white/15 py-1.5 text-xs text-white/70 hover:bg-white/5"
          >
            Collapse summary
          </button>
        </div>
      ) : null}
    </section>
  );
}

function CategoryFilterTabs({
  active,
  onChange,
  deviceItems,
  planNotes,
  manualCounts,
  manualMode,
}: {
  active: TakeoffFilterTab;
  onChange: (t: TakeoffFilterTab) => void;
  deviceItems: ElectricalItemRow[];
  planNotes: ElectricalItemRow[];
  manualCounts: Record<string, number>;
  manualMode: boolean;
}) {
  const counts = useMemo(
    () => takeoffBucketCounts([...deviceItems, ...planNotes], manualCounts, manualMode),
    [deviceItems, planNotes, manualCounts, manualMode],
  );
  const tabs = TAKEOFF_TAB_META.filter((t) => t.id !== "all");
  return (
    <div className="mb-4 flex flex-wrap gap-1.5 border-b border-white/10 pb-3">
      <button
        type="button"
        onClick={() => onChange("all")}
        className={[
          "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
          active === "all"
            ? "border-[#E8C84A] bg-[#E8C84A]/20 text-[#E8C84A]"
            : "border-white/15 text-white/75 hover:bg-white/5",
        ].join(" ")}
      >
        All
        <span className="ml-1 rounded-md bg-black/30 px-1.5 tabular-nums text-[10px]">
          {counts.all}
        </span>
      </button>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={[
            "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
            active === t.id
              ? "border-sky-400/60 bg-sky-950/45 text-sky-100"
              : "border-white/15 text-white/75 hover:bg-white/5",
          ].join(" ")}
        >
          {t.label}
          <span className="ml-1 rounded-md bg-black/30 px-1.5 tabular-nums text-[10px]">
            {counts[t.id]}
          </span>
        </button>
      ))}
    </div>
  );
}

function SendToToolsRow({
  items,
  rooms,
  projectLabel,
}: {
  items: ElectricalItemRow[];
  rooms: DetectedRoomRow[];
  projectLabel: string;
}) {
  const router = useRouter();
  const showAv = takeoffHasAvSignals(items);
  const showSh = takeoffHasSmartHomeSignals(items);
  if (items.length === 0) return null;
  const btn =
    "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors";
  return (
    <section className="mb-4 rounded-xl border border-white/12 bg-white/[0.04] p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-white/45">
        Send to tools
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`${btn} border-amber-500/40 bg-amber-950/30 text-amber-100 hover:bg-amber-950/45`}
          onClick={() => {
            pushTakeoffToLoadCalculator(items, rooms, projectLabel);
            router.push("/tools/load-calculator");
          }}
        >
          → Load Calculator
        </button>
        <button
          type="button"
          className={`${btn} border-yellow-500/35 bg-yellow-950/25 text-yellow-100 hover:bg-yellow-950/40`}
          onClick={() => {
            pushTakeoffToElectricalAnalyzer(items, rooms, projectLabel);
            router.push("/tools/electrical-analyzer");
          }}
        >
          → Electrical Analyzer
        </button>
        <button
          type="button"
          className={`${btn} border-violet-500/40 bg-violet-950/30 text-violet-100 hover:bg-violet-950/45`}
          onClick={() => {
            pushTakeoffToNecChecker(items, projectLabel);
            router.push("/tools/nec-checker");
          }}
        >
          → NEC Checker
        </button>
        {showAv ? (
          <button
            type="button"
            className={`${btn} border-rose-500/40 bg-rose-950/30 text-rose-100 hover:bg-rose-950/45`}
            onClick={() => {
              pushTakeoffToAvAnalyzer(rooms, projectLabel);
              router.push("/tools/av-analyzer");
            }}
          >
            → AV Analyzer
          </button>
        ) : null}
        {showSh ? (
          <button
            type="button"
            className={`${btn} border-cyan-500/40 bg-cyan-950/30 text-cyan-100 hover:bg-cyan-950/45`}
            onClick={() => {
              pushTakeoffToSmartHomeAnalyzer(rooms, projectLabel);
              router.push("/tools/smarthome-analyzer");
            }}
          >
            → Smart Home Analyzer
          </button>
        ) : null}
      </div>
    </section>
  );
}

function RoomAssignmentSplitView({
  pageRooms,
  unassignedItems,
  onDropItemOnRoom,
  draggingItemId,
  dragOverRoomId,
  onDragOverRoom,
  onDragItemChange,
}: {
  pageRooms: DetectedRoomRow[];
  unassignedItems: ElectricalItemRow[];
  onDropItemOnRoom: (itemId: string, roomName: string) => void;
  draggingItemId: string | null;
  dragOverRoomId: string | null;
  onDragOverRoom: (roomId: string | null) => void;
  onDragItemChange?: (itemId: string | null) => void;
}) {
  return (
    <div className="mb-4 flex min-h-[min(50vh,360px)] flex-col gap-3 rounded-xl border border-cyan-500/35 bg-[#030a14] p-3 lg:flex-row lg:gap-4">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <p className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-cyan-200/95">
          Rooms
        </p>
        <p className="shrink-0 text-[10px] text-white/55">
          Drag items from the right into a room row below.
        </p>
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {pageRooms.map((room) => {
            const active = dragOverRoomId === room.id && draggingItemId;
            return (
              <li
                key={room.id}
                className={[
                  "rounded-lg border px-2 py-2 transition-colors",
                  active
                    ? "border-cyan-400 bg-cyan-950/40 ring-2 ring-cyan-400/50"
                    : "border-white/12 bg-white/[0.04]",
                ].join(" ")}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  onDragOverRoom(room.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData(ITEM_DRAG_MIME);
                  onDragOverRoom(null);
                  if (id) onDropItemOnRoom(id, room.room_name);
                }}
              >
                <span className="text-xs font-semibold text-white">
                  {room.room_name}
                </span>
                <span className="ml-2 text-[10px] text-white/45">
                  Page {room.page_number}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 border-t border-white/10 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
        <p className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-amber-200/95">
          Unassigned items
        </p>
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {unassignedItems.length === 0 ? (
            <li className="text-xs text-white/45">Nothing unassigned.</li>
          ) : (
            unassignedItems.map((item) => (
              <li
                key={item.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(ITEM_DRAG_MIME, item.id);
                  e.dataTransfer.effectAllowed = "move";
                  onDragItemChange?.(item.id);
                }}
                onDragEnd={() => onDragItemChange?.(null)}
                className="cursor-grab rounded-lg border border-amber-500/25 bg-amber-950/25 px-2 py-1.5 text-xs text-amber-50/95 active:cursor-grabbing"
              >
                <span className="font-medium text-white">
                  {item.description}
                </span>
                <span className="ml-2 tabular-nums text-white/55">
                  × {Math.round(Number(item.quantity))}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

export function mergeById(
  prev: ElectricalItemRow[],
  updates: ElectricalItemRow[],
): ElectricalItemRow[] {
  const m = new Map(updates.map((u) => [u.id, u]));
  return prev.map((row) => m.get(row.id) ?? row);
}

export function AnalysisResultsPanel({
  items,
  rooms,
  currentPage,
  manualMode,
  manualCounts,
  selectedManualItemId,
  onSelectManualItem,
  onManualCountDelta,
  onResetManualItemToAi,
  onPatchItems,
  onPatchRooms,
  roomAssignmentView,
  onRoomAssignmentViewChange,
  pageAnalysisWarning,
  onRetryAnalysisPage,
  analyzeBusy,
  onExportRoom,
  projectId,
  projectLabel = "Project",
  onOpenTakeoffExport,
  onExportAllTakeoffPdf,
  onExportAllTakeoffCsv,
  onRequestItemVerify,
}: {
  items: ElectricalItemRow[];
  rooms: DetectedRoomRow[];
  currentPage: number;
  manualMode: boolean;
  manualCounts: Record<string, number>;
  selectedManualItemId: string | null;
  onSelectManualItem: (id: string) => void;
  onManualCountDelta: (id: string, delta: number) => void;
  onResetManualItemToAi: (id: string) => void;
  onPatchItems: (updates: ElectricalItemRow[]) => void;
  onPatchRooms?: (updates: DetectedRoomRow[]) => void;
  /** Controlled from project toolbar when provided with `onRoomAssignmentViewChange`. */
  roomAssignmentView?: boolean;
  onRoomAssignmentViewChange?: (open: boolean) => void;
  pageAnalysisWarning?: string | null;
  onRetryAnalysisPage?: () => void;
  analyzeBusy?: boolean;
  onExportRoom?: (room: DetectedRoomRow) => void;
  /** For materials list + linking (optional). */
  projectId?: string;
  projectLabel?: string;
  onOpenTakeoffExport?: () => void;
  onExportAllTakeoffPdf?: () => void;
  onExportAllTakeoffCsv?: () => void;
  onRequestItemVerify?: (item: ElectricalItemRow) => void;
}) {
  const router = useRouter();
  const patchRooms = onPatchRooms ?? (() => {});
  const [, bump] = useState(0);
  const refresh = useCallback(() => bump((x) => x + 1), []);

  const resolve = async (itemId: string, choice: "claude" | "gpt") => {
    const res = await fetch("/api/electrical-items/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, choice }),
    });
    const json = (await res.json()) as {
      items?: ElectricalItemRow[];
      error?: string;
    };
    if (!res.ok) throw new Error(json.error ?? "Resolve failed.");
    if (json.items?.length) onPatchItems(json.items);
  };

  const pageItems = useMemo(
    () => items.filter((i) => i.page_number === currentPage),
    [items, currentPage],
  );
  const pageRooms = useMemo(
    () =>
      [...rooms.filter((r) => r.page_number === currentPage)].sort((a, b) =>
        a.room_name.localeCompare(b.room_name),
      ),
    [rooms, currentPage],
  );

  const planNotes = useMemo(
    () => pageItems.filter((i) => i.category === "plan_note"),
    [pageItems],
  );
  const deviceItems = useMemo(
    () => pageItems.filter((i) => i.category !== "plan_note"),
    [pageItems],
  );

  const [takeoffSummaryOpen, setTakeoffSummaryOpen] = useState(false);
  const [categoryTab, setCategoryTab] = useState<TakeoffFilterTab>("all");
  const [materialsBusy, setMaterialsBusy] = useState(false);

  const filteredDeviceItems = useMemo(() => {
    if (categoryTab === "all") return deviceItems;
    if (categoryTab === "plan_notes") return [];
    return deviceItems.filter((i) => itemMatchesTakeoffTab(i, categoryTab));
  }, [deviceItems, categoryTab]);

  const visiblePlanNotes = useMemo(() => {
    if (categoryTab !== "all" && categoryTab !== "plan_notes") return [];
    return planNotes;
  }, [planNotes, categoryTab]);

  const roomAssignOptions = useMemo(
    () => assignableRoomOptionsWithDisambiguatedLabels(pageRooms),
    [pageRooms],
  );

  const itemsByRoom = useMemo(() => {
    const map = new Map<string, ElectricalItemRow[]>();
    for (const room of pageRooms) {
      const list = filteredDeviceItems.filter(
        (i) =>
          itemMatchesDetectedRoom(i, room) &&
          !isItemUnassignedForPage(i, pageRooms),
      );
      map.set(room.id, list);
    }
    return map;
  }, [pageRooms, filteredDeviceItems]);

  const unassignedItems = useMemo(
    () => deviceItems.filter((i) => isItemUnassignedForPage(i, pageRooms)),
    [deviceItems, pageRooms],
  );

  const filteredUnassignedItems = useMemo(
    () =>
      filteredDeviceItems.filter((i) =>
        isItemUnassignedForPage(i, pageRooms),
      ),
    [filteredDeviceItems, pageRooms],
  );

  const convertToMaterialsList = useCallback(async () => {
    if (!projectId || items.length === 0) return;
    setMaterialsBusy(true);
    try {
      const { state, lineCount } = buildProjectBreakdownFromTakeoffItems(
        items,
        manualCounts,
        manualMode,
        projectLabel,
      );
      const sb = createBrowserClient();
      const { data, error } = await sb
        .from("project_breakdowns")
        .insert({
          name: `${projectLabel} — Takeoff materials`,
          state_json: state as unknown as Record<string, unknown>,
        })
        .select("id")
        .single();
      if (error) throw error;
      const id = data?.id ? String(data.id) : null;
      if (id) {
        window.alert(
          `Materials list created from scan — ${lineCount} line item${lineCount === 1 ? "" : "s"}.`,
        );
        router.push(`/tools/project-breakdown?id=${encodeURIComponent(id)}`);
      }
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "Could not create materials list.",
      );
    } finally {
      setMaterialsBusy(false);
    }
  }, [
    projectId,
    items,
    manualCounts,
    manualMode,
    projectLabel,
    router,
  ]);

  const assignItemToRoom = useCallback(
    async (itemId: string, roomName: string) => {
      try {
        const res = await fetch("/api/electrical-items/assign-room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, whichRoom: roomName }),
        });
        const json = (await res.json()) as {
          item?: ElectricalItemRow;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "Assign failed.");
        if (json.item) onPatchItems([json.item]);
        refresh();
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Assign failed.");
      }
    },
    [onPatchItems, refresh],
  );

  const summary = useMemo(() => {
    const unverified = deviceItems.filter((i) => {
      const c = Math.round(Number(i.quantity));
      const g = i.gpt_count != null ? Math.round(Number(i.gpt_count)) : null;
      const v = verifyState(c, g, i.verification_status ?? "pending");
      return v === "unverified" || v === "verify_needed";
    }).length;
    const conflicts = deviceItems.filter(
      (i) => i.verification_status === "conflict",
    ).length;
    const allClear =
      deviceItems.length > 0 && unverified === 0 && conflicts === 0;
    const totalDevices = deviceItems.reduce(
      (s, i) => s + effectiveQty(i, manualCounts, manualMode),
      0,
    );
    return {
      rooms: pageRooms.length,
      totalItems: deviceItems.length,
      totalDevices,
      unverified,
      conflicts,
      allClear,
    };
  }, [deviceItems, pageRooms.length, manualCounts, manualMode]);

  const summaryBarClass = summary.allClear
    ? "border-emerald-500/40 bg-emerald-950/40"
    : summary.conflicts > 0
      ? "border-red-500/40 bg-red-950/35"
      : summary.unverified > 0
        ? "border-amber-500/40 bg-amber-950/35"
        : "border-white/15 bg-white/[0.06]";

  const [expandedRooms, setExpandedRooms] = useState<Record<string, boolean>>(
    {},
  );
  const [planOpen, setPlanOpen] = useState(true);
  const [internalAssignment, setInternalAssignment] = useState(false);
  const assignmentControlled =
    typeof onRoomAssignmentViewChange === "function";
  const assignmentOpen = assignmentControlled
    ? Boolean(roomAssignmentView)
    : internalAssignment;
  const setAssignmentOpen = useCallback(
    (next: boolean) => {
      if (assignmentControlled) onRoomAssignmentViewChange?.(next);
      else setInternalAssignment(next);
    },
    [assignmentControlled, onRoomAssignmentViewChange],
  );

  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkMoveRoomId, setBulkMoveRoomId] = useState("");
  const [assignAllOpen, setAssignAllOpen] = useState(false);
  const [assignAllRoomId, setAssignAllRoomId] = useState("");
  const [dragOverRoomId, setDragOverRoomId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [roomOverrideBulkId, setRoomOverrideBulkId] = useState<string | null>(
    null,
  );
  const [acceptAllBusy, setAcceptAllBusy] = useState(false);

  useEffect(() => {
    if (!bulkMode) setBulkSelected(new Set());
  }, [bulkMode]);

  useEffect(() => {
    setRoomOverrideBulkId(null);
  }, [currentPage]);

  useEffect(() => {
    const clear = () => {
      setDragOverRoomId(null);
      setDraggingItemId(null);
    };
    window.addEventListener("dragend", clear);
    return () => window.removeEventListener("dragend", clear);
  }, []);

  const runBulkAssign = useCallback(async () => {
    const opt = roomAssignOptions.find((o) => o.id === bulkMoveRoomId);
    if (!opt) {
      window.alert("Choose a destination room.");
      return;
    }
    const ids = [...bulkSelected];
    if (ids.length === 0) return;
    try {
      const res = await fetch("/api/electrical-items/assign-rooms-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: ids, whichRoom: opt.room_name }),
      });
      const json = (await res.json()) as {
        items?: ElectricalItemRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Bulk assign failed.");
      if (json.items?.length) onPatchItems(json.items);
      setBulkSelected(new Set());
      setBulkMode(false);
      refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Bulk assign failed.");
    }
  }, [bulkMoveRoomId, bulkSelected, roomAssignOptions, onPatchItems, refresh]);

  const runAssignAllUnassigned = useCallback(async () => {
    const opt = roomAssignOptions.find((o) => o.id === assignAllRoomId);
    if (!opt) {
      window.alert("Choose a room.");
      return;
    }
    const ids = unassignedItems.map((i) => i.id);
    if (ids.length === 0) return;
    try {
      const res = await fetch("/api/electrical-items/assign-rooms-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: ids, whichRoom: opt.room_name }),
      });
      const json = (await res.json()) as {
        items?: ElectricalItemRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Assign all failed.");
      if (json.items?.length) onPatchItems(json.items);
      setAssignAllOpen(false);
      refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Assign all failed.");
    }
  }, [
    assignAllRoomId,
    roomAssignOptions,
    unassignedItems,
    onPatchItems,
    refresh,
  ]);

  const [manualCompareDismissed, setManualCompareDismissed] = useState<
    Set<string>
  >(() => new Set());

  useEffect(() => {
    setManualCompareDismissed(new Set());
  }, [currentPage]);

  const dismissManualCompareHint = useCallback((itemId: string) => {
    setManualCompareDismissed((prev) => new Set(prev).add(itemId));
  }, []);

  const keepAiCountForItem = useCallback(
    async (itemId: string) => {
      try {
        const res = await fetch("/api/electrical-items/accept-verified", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId }),
        });
        const json = (await res.json()) as {
          item?: ElectricalItemRow;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "Could not use AI count.");
        if (json.item) onPatchItems([json.item]);
        dismissManualCompareHint(itemId);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Could not use AI count.");
      }
    },
    [onPatchItems, dismissManualCompareHint],
  );

  const acceptItemsByList = useCallback(
    async (targets: ElectricalItemRow[]) => {
      const list = targets.filter((i) => i.category !== "plan_note");
      if (list.length === 0) return;
      setAcceptAllBusy(true);
      try {
        for (const it of list) {
          const res = await fetch("/api/electrical-items/accept-verified", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: it.id }),
          });
          const json = (await res.json()) as {
            item?: ElectricalItemRow;
            error?: string;
          };
          if (!res.ok) throw new Error(json.error ?? "Accept failed.");
          if (json.item) onPatchItems([json.item]);
        }
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Accept failed.");
      } finally {
        setAcceptAllBusy(false);
      }
    },
    [onPatchItems],
  );

  const acceptAllInRoom = useCallback(
    async (roomItems: ElectricalItemRow[]) => {
      await acceptItemsByList(roomItems);
    },
    [acceptItemsByList],
  );

  const acceptAllPageItems = useCallback(async () => {
    await acceptItemsByList(deviceItems);
  }, [acceptItemsByList, deviceItems]);

  const manualCompareHintFor = useCallback(
    (row: ElectricalItemRow) => {
      if (manualMode) return false;
      if (row.category === "plan_note") return false;
      if (row.verification_status !== "manual") return false;
      const fc = row.final_count;
      if (fc == null) return false;
      if (
        Math.round(Number(fc)) === Math.round(Number(row.quantity))
      ) {
        return false;
      }
      if (manualCompareDismissed.has(row.id)) return false;
      return true;
    },
    [manualMode, manualCompareDismissed],
  );

  const showRoomUi = !manualMode && roomAssignOptions.length > 0;

  useEffect(() => {
    setExpandedRooms((prev) => {
      const next = { ...prev };
      for (const r of pageRooms) {
        if (next[r.id] === undefined) next[r.id] = true;
      }
      return next;
    });
  }, [pageRooms]);

  const toggleRoom = (id: string) => {
    setExpandedRooms((p) => ({ ...p, [id]: !p[id] }));
  };

  return (
    <aside
      className="flex max-h-[50vh] shrink-0 flex-col border-t border-white/10 bg-[#071422]/90 lg:max-h-none lg:w-[min(100%,480px)] lg:border-l lg:border-t-0 xl:w-[500px]"
      aria-label="Analysis results"
    >
      <div
        className={`sticky top-0 z-20 shrink-0 border-b px-3 py-2.5 backdrop-blur-md ${summaryBarClass}`}
      >
        <p className="text-center text-xs font-semibold leading-relaxed text-white/95">
          <span className="text-white/90">{summary.rooms} rooms</span>
          <span className="mx-1.5 text-white/35">|</span>
          <span className="text-white/90">
            {summary.totalItems} items · {summary.totalDevices} devices
          </span>
          <span className="mx-1.5 text-white/35">|</span>
          <span
            className={
              summary.unverified > 0 ? "text-amber-200" : "text-white/50"
            }
          >
            {summary.unverified} unverified
          </span>
          <span className="mx-1.5 text-white/35">|</span>
          <span
            className={
              summary.conflicts > 0 ? "text-red-300" : "text-white/50"
            }
          >
            {summary.conflicts} conflicts
          </span>
        </p>
        {summary.allClear ? (
          <p className="mt-1 text-center text-[10px] font-medium text-emerald-300/95">
            All counts confirmed
          </p>
        ) : null}
        {pageItems.length > 0 && !manualMode ? (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 border-t border-white/10 pt-2">
            <button
              type="button"
              onClick={() => {
                const next = !assignmentOpen;
                setAssignmentOpen(next);
                if (next) setBulkMode(false);
              }}
              className={[
                "rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                assignmentOpen
                  ? "border-cyan-400 bg-cyan-950/50 text-cyan-100"
                  : "border-white/20 bg-white/10 text-white/90 hover:bg-white/15",
              ].join(" ")}
            >
              {assignmentOpen ? "Exit assignment view" : "Room assignment view"}
            </button>
            <button
              type="button"
              onClick={() => {
                setBulkMode((m) => {
                  const next = !m;
                  if (next) setAssignmentOpen(false);
                  return next;
                });
              }}
              className={[
                "rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                bulkMode
                  ? "border-violet-400 bg-violet-950/45 text-violet-100"
                  : "border-white/20 bg-white/10 text-white/90 hover:bg-white/15",
              ].join(" ")}
            >
              {bulkMode ? "Done selecting" : "Bulk reassign"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
        {manualMode ? (
          <p className="mb-3 rounded-lg border border-sky-500/30 bg-sky-950/25 px-3 py-2 text-xs text-sky-100/95">
            Manual count: pick a room in the toolbar, select an item, then click
            the blueprint. Dots are colored by room and shaped by item type.
          </p>
        ) : null}

        {deviceItems.length > 0 && !manualMode && !assignmentOpen ? (
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={acceptAllBusy}
              onClick={() => void acceptAllPageItems()}
              className="rounded-lg border border-emerald-500/45 bg-emerald-950/40 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-950/55 disabled:opacity-45"
            >
              {acceptAllBusy ? "Accepting…" : "Accept All Items"}
            </button>
            {onExportAllTakeoffPdf ? (
              <button
                type="button"
                onClick={() => onExportAllTakeoffPdf()}
                className="rounded-lg border border-sky-500/45 bg-sky-950/40 px-2.5 py-1.5 text-[11px] font-semibold text-sky-100 hover:bg-sky-950/55"
              >
                Export All as PDF
              </button>
            ) : null}
            {onExportAllTakeoffCsv ? (
              <button
                type="button"
                onClick={() => onExportAllTakeoffCsv()}
                className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/15"
              >
                Export All as CSV
              </button>
            ) : null}
          </div>
        ) : null}

        {pageAnalysisWarning ? (
          <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-3 text-sm text-amber-50/95">
            <p>{pageAnalysisWarning}</p>
            {onRetryAnalysisPage ? (
              <button
                type="button"
                disabled={analyzeBusy}
                onClick={() => onRetryAnalysisPage()}
                className="mt-2 rounded-lg border border-amber-400/50 bg-amber-600/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Retry Page
              </button>
            ) : null}
          </div>
        ) : null}

        {pageItems.length === 0 && !pageAnalysisWarning ? (
          <p className="rounded-lg border border-dashed border-white/15 px-4 py-8 text-center text-sm text-white/45">
            No items for this page. Run analysis to populate results.
          </p>
        ) : pageItems.length === 0 && pageAnalysisWarning ? (
          <p className="rounded-lg border border-dashed border-white/10 px-4 py-4 text-center text-xs text-white/40">
            No line items were added for this page on the last run. Use Retry Page
            above or analyze again from the toolbar.
          </p>
        ) : assignmentOpen ? (
          <RoomAssignmentSplitView
            pageRooms={pageRooms}
            unassignedItems={unassignedItems}
            onDropItemOnRoom={(id, name) => void assignItemToRoom(id, name)}
            draggingItemId={draggingItemId}
            dragOverRoomId={dragOverRoomId}
            onDragOverRoom={setDragOverRoomId}
            onDragItemChange={setDraggingItemId}
          />
        ) : (
          <>
            {pageItems.length > 0 ? (
              <TakeoffSummaryCollapsible
                deviceItems={deviceItems}
                planNotes={planNotes}
                pageRooms={pageRooms}
                manualCounts={manualCounts}
                manualMode={manualMode}
                expanded={takeoffSummaryOpen}
                onToggleExpanded={() =>
                  setTakeoffSummaryOpen((o) => !o)
                }
                onExport={onOpenTakeoffExport}
              />
            ) : null}
            {pageItems.length > 0 ? (
              <CategoryFilterTabs
                active={categoryTab}
                onChange={setCategoryTab}
                deviceItems={deviceItems}
                planNotes={planNotes}
                manualCounts={manualCounts}
                manualMode={manualMode}
              />
            ) : null}
            {items.length > 0 ? (
              <SendToToolsRow
                items={items}
                rooms={rooms}
                projectLabel={projectLabel}
              />
            ) : null}
            {items.length > 0 && projectId ? (
              <div className="mb-4">
                <button
                  type="button"
                  disabled={materialsBusy}
                  onClick={() => void convertToMaterialsList()}
                  className="w-full rounded-lg border border-[#E8C84A]/50 bg-[#E8C84A]/15 px-3 py-2 text-xs font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/25 disabled:opacity-50"
                >
                  {materialsBusy
                    ? "Creating materials list…"
                    : "Convert to Materials List"}
                </button>
              </div>
            ) : null}
            {pageItems.length > 0 &&
            categoryTab !== "plan_notes" &&
            filteredDeviceItems.length === 0 &&
            visiblePlanNotes.length === 0 ? (
              <p className="mb-3 rounded-lg border border-dashed border-white/15 px-3 py-4 text-center text-xs text-white/50">
                No items in this category on this page.
              </p>
            ) : null}
            {categoryTab !== "plan_notes" ? (
            <div className="space-y-3">
              {pageRooms.map((room) => {
                const list = itemsByRoom.get(room.id) ?? [];
                const expanded = expandedRooms[room.id] !== false;
                const types = new Set(list.map((i) => i.description));
                const deviceTotal = list.reduce(
                  (s, i) =>
                    s + effectiveQty(i, manualCounts, manualMode),
                  0,
                );
                const dropHighlight =
                  Boolean(showRoomUi && draggingItemId && dragOverRoomId === room.id);
                return (
                  <article
                    key={room.id}
                    className={[
                      "overflow-hidden rounded-xl border shadow-sm transition-[box-shadow,background-color,border-color]",
                      dropHighlight
                        ? "border-cyan-400 bg-cyan-950/25 ring-2 ring-cyan-400/40"
                        : "border-white/12 bg-white/[0.04]",
                    ].join(" ")}
                    onDragOver={
                      showRoomUi
                        ? (e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            setDragOverRoomId(room.id);
                          }
                        : undefined
                    }
                    onDrop={
                      showRoomUi
                        ? (e) => {
                            e.preventDefault();
                            const id = e.dataTransfer.getData(ITEM_DRAG_MIME);
                            setDragOverRoomId(null);
                            setDraggingItemId(null);
                            if (id)
                              void assignItemToRoom(id, room.room_name);
                          }
                        : undefined
                    }
                  >
                    <RoomHeader
                      room={room}
                      expanded={expanded}
                      onToggle={() => toggleRoom(room.id)}
                      deviceTotal={deviceTotal}
                      onPatchRooms={patchRooms}
                      onExportRoom={
                        onExportRoom ? () => onExportRoom(room) : undefined
                      }
                      onAcceptAllInRoom={
                        !manualMode && list.length > 0
                          ? () => void acceptAllInRoom(list)
                          : undefined
                      }
                      onOverrideAllInRoom={
                        !manualMode && list.length > 0
                          ? () =>
                              setRoomOverrideBulkId((id) =>
                                id === room.id ? null : room.id,
                              )
                          : undefined
                      }
                    />
                    {expanded ? (
                      <div className="space-y-2 px-3 py-3">
                        {list.length === 0 ? (
                          <p className="text-xs text-white/45">
                            No items assigned to this room.
                          </p>
                        ) : (
                          list.map((item) => (
                            <CompactItemRow
                              key={item.id}
                              item={item}
                              manualMode={manualMode}
                              manualCount={manualCounts[item.id]}
                              selectedManualItemId={selectedManualItemId}
                              onSelectManualItem={onSelectManualItem}
                              onManualCountDelta={onManualCountDelta}
                              onResetManualItemToAi={onResetManualItemToAi}
                              onAcceptGpt={(id) => void resolve(id, "gpt")}
                              onPatchItems={onPatchItems}
                              assignableRoomOptions={roomAssignOptions}
                              roomSelectEnabled={showRoomUi}
                              dragEnabled={showRoomUi && !bulkMode}
                              onDragItemChange={setDraggingItemId}
                              showBulkCheckbox={bulkMode}
                              bulkChecked={bulkSelected.has(item.id)}
                              onBulkToggle={() =>
                                setBulkSelected((prev) => {
                                  const n = new Set(prev);
                                  if (n.has(item.id)) n.delete(item.id);
                                  else n.add(item.id);
                                  return n;
                                })
                              }
                              onAssigned={refresh}
                              manualCompareHint={manualCompareHintFor(item)}
                              onDismissManualCompare={dismissManualCompareHint}
                              onKeepAiCount={(id) => void keepAiCountForItem(id)}
                              forceOverrideOpen={roomOverrideBulkId === room.id}
                              onRequestVerify={
                                !manualMode && onRequestItemVerify
                                  ? () => onRequestItemVerify(item)
                                  : undefined
                              }
                            />
                          ))
                        )}
                        <p className="border-t border-white/10 pt-2 text-[11px] text-white/50">
                          {types.size} item type{types.size === 1 ? "" : "s"} ·{" "}
                          {deviceTotal} total devices
                        </p>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
            ) : null}

            {categoryTab !== "plan_notes" &&
            filteredUnassignedItems.length > 0 ? (
              <section className="mt-5 rounded-xl border border-amber-500/35 bg-amber-950/20 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-amber-100">
                      UNASSIGNED ITEMS ({filteredUnassignedItems.length})
                    </h3>
                    <p className="mt-1 text-xs text-amber-100/80">
                      Drag to a room, use the room menu, quick buttons, or assign
                      all at once.
                    </p>
                  </div>
                  {showRoomUi ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAssignAllRoomId(roomAssignOptions[0]?.id ?? "");
                        setAssignAllOpen(true);
                      }}
                      className="shrink-0 rounded-lg border border-amber-400/50 bg-amber-900/40 px-2.5 py-1 text-[11px] font-semibold text-amber-50 hover:bg-amber-900/60"
                    >
                      Assign all…
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 space-y-2">
                  {filteredUnassignedItems.map((item) => (
                    <CompactItemRow
                      key={item.id}
                      item={item}
                      manualMode={manualMode}
                      manualCount={manualCounts[item.id]}
                      selectedManualItemId={selectedManualItemId}
                      onSelectManualItem={onSelectManualItem}
                      onManualCountDelta={onManualCountDelta}
                      onResetManualItemToAi={onResetManualItemToAi}
                      onAcceptGpt={(id) => void resolve(id, "gpt")}
                      onPatchItems={onPatchItems}
                      assignableRoomOptions={roomAssignOptions}
                      roomSelectEnabled={showRoomUi}
                      dragEnabled={showRoomUi && !bulkMode}
                      onDragItemChange={setDraggingItemId}
                      showBulkCheckbox={bulkMode}
                      bulkChecked={bulkSelected.has(item.id)}
                      onBulkToggle={() =>
                        setBulkSelected((prev) => {
                          const n = new Set(prev);
                          if (n.has(item.id)) n.delete(item.id);
                          else n.add(item.id);
                          return n;
                        })
                      }
                      quickSuggestRooms={suggestedRoomOptionsForItem(
                        item,
                        roomAssignOptions,
                      )}
                      onAssigned={refresh}
                      manualCompareHint={manualCompareHintFor(item)}
                      onDismissManualCompare={dismissManualCompareHint}
                      onKeepAiCount={(id) => void keepAiCountForItem(id)}
                      forceOverrideOpen={false}
                      onRequestVerify={
                        !manualMode && onRequestItemVerify
                          ? () => onRequestItemVerify(item)
                          : undefined
                      }
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {visiblePlanNotes.length > 0 ? (
              <details
                open={planOpen}
                className="mt-5 rounded-xl border border-emerald-500/35 bg-emerald-950/20"
                onToggle={(e) =>
                  setPlanOpen((e.target as HTMLDetailsElement).open)
                }
              >
                <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold text-emerald-100">
                  Plan Notes &amp; Specifications ({visiblePlanNotes.length}{" "}
                  notes)
                </summary>
                <div className="space-y-2 border-t border-emerald-500/20 px-3 py-3">
                  {visiblePlanNotes.map((item) => (
                    <CompactItemRow
                      key={item.id}
                      item={item}
                      manualMode={false}
                      manualCount={undefined}
                      selectedManualItemId={null}
                      onSelectManualItem={() => {}}
                      onManualCountDelta={() => {}}
                      onResetManualItemToAi={() => {}}
                      onAcceptGpt={() => {}}
                      onPatchItems={onPatchItems}
                    />
                  ))}
                </div>
              </details>
            ) : null}
          </>
        )}
        </div>

        {bulkMode && bulkSelected.size > 0 ? (
          <div className="z-30 shrink-0 border-t border-cyan-500/40 bg-[#050d18] px-3 py-2.5 shadow-[0_-4px_20px_rgba(0,0,0,0.4)]">
            <p className="mb-2 text-center text-[11px] font-semibold text-cyan-100">
              {bulkSelected.size} item{bulkSelected.size === 1 ? "" : "s"}{" "}
              selected — Move to:
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <select
                value={bulkMoveRoomId}
                onChange={(e) => setBulkMoveRoomId(e.target.value)}
                className="max-w-[12rem] rounded-lg border border-white/20 bg-[#0a1628] px-2 py-1.5 text-xs text-white"
              >
                <option value="">Choose room…</option>
                {roomAssignOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void runBulkAssign()}
                className="rounded-lg border border-emerald-500/45 bg-emerald-600/30 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-600/45"
              >
                Move
              </button>
              <button
                type="button"
                onClick={() => setBulkSelected(new Set())}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white/85 hover:bg-white/15"
              >
                Clear selection
              </button>
              <button
                type="button"
                onClick={() => {
                  setBulkMode(false);
                  setBulkSelected(new Set());
                }}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/60 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {assignAllOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAssignAllOpen(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-amber-400/40 bg-[#0a1628] p-4 shadow-xl"
            role="dialog"
            aria-labelledby="assign-all-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h4
              id="assign-all-title"
              className="text-sm font-bold text-amber-100"
            >
              Assign all unassigned
            </h4>
            <p className="mt-1 text-xs text-white/65">
              Move all {unassignedItems.length} unassigned line
              {unassignedItems.length === 1 ? "" : "s"} to:
            </p>
            <select
              value={assignAllRoomId}
              onChange={(e) => setAssignAllRoomId(e.target.value)}
              className="mt-3 w-full rounded-lg border border-white/20 bg-[#071422] px-2 py-2 text-sm text-white"
            >
              {roomAssignOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssignAllOpen(false)}
                className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void runAssignAllUnassigned()}
                className="rounded-lg border border-amber-500/50 bg-amber-600/35 px-3 py-1.5 text-xs font-semibold text-amber-50 hover:bg-amber-600/50"
              >
                Assign all
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
