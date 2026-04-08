"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import { createBrowserClient } from "@/lib/supabase/client";

type SupplyHouseContactRow = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string;
  subject_override: string | null;
  body_closing_override: string | null;
  active: boolean;
  sort_order: number;
};

type FormDraft = {
  id?: string;
  name: string;
  contact_name: string;
  email: string;
  subject_override: string;
  body_closing_override: string;
  active: boolean;
  sort_order: number;
};

function emptyDraft(): FormDraft {
  return {
    name: "",
    contact_name: "",
    email: "",
    subject_override: "",
    body_closing_override: "",
    active: true,
    sort_order: 0,
  };
}

function draftFromRow(row: SupplyHouseContactRow): FormDraft {
  return {
    id: row.id,
    name: row.name,
    contact_name: row.contact_name ?? "",
    email: row.email,
    subject_override: row.subject_override ?? "",
    body_closing_override: row.body_closing_override ?? "",
    active: row.active,
    sort_order: row.sort_order,
  };
}

const fieldClass =
  "mt-1 block w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-[#E8C84A]/50 focus:outline-none";

export function SupplyHouseSettings() {
  const { role, loading: roleLoading } = useUserRole();
  const { showToast } = useAppToast();
  const allowed = role === "admin" || role === "super_admin";

  const [rows, setRows] = useState<SupplyHouseContactRow[]>([]);
  const [loadBusy, setLoadBusy] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [draft, setDraft] = useState<FormDraft>(() => emptyDraft());
  const [saveBusy, setSaveBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadBusy(true);
    try {
      const sb = createBrowserClient();
      const { data, error } = await sb
        .from("supply_house_contacts")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      setRows((data ?? []) as unknown as SupplyHouseContactRow[]);
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Load failed.",
        variant: "error",
      });
      setRows([]);
    } finally {
      setLoadBusy(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!roleLoading && allowed) void load();
  }, [roleLoading, allowed, load]);

  const resetForm = () => {
    setEditingId(null);
    setAddingNew(false);
    setDraft(emptyDraft());
  };

  const save = async () => {
    const name = draft.name.trim();
    const email = draft.email.trim();
    if (!name || !email) {
      showToast({
        message: "Name and email are required.",
        variant: "error",
      });
      return;
    }
    setSaveBusy(true);
    try {
      const sb = createBrowserClient();
      const now = new Date().toISOString();
      const payload = {
        name,
        contact_name: draft.contact_name.trim() || null,
        email,
        subject_override: draft.subject_override.trim() || null,
        body_closing_override: draft.body_closing_override.trim() || null,
        active: draft.active,
        sort_order: Number.isFinite(draft.sort_order)
          ? Math.trunc(draft.sort_order)
          : 0,
        updated_at: now,
      };
      if (addingNew || !draft.id) {
        const { error } = await sb.from("supply_house_contacts").insert({
          ...payload,
          created_at: now,
        });
        if (error) throw new Error(error.message);
        showToast({ message: "Supply house added.", variant: "success" });
      } else {
        const { error } = await sb
          .from("supply_house_contacts")
          .upsert(
            { id: draft.id, ...payload },
            { onConflict: "id" },
          );
        if (error) throw new Error(error.message);
        showToast({ message: "Saved.", variant: "success" });
      }
      resetForm();
      await load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Save failed.",
        variant: "error",
      });
    } finally {
      setSaveBusy(false);
    }
  };

  const toggleActive = async (row: SupplyHouseContactRow, active: boolean) => {
    setTogglingId(row.id);
    try {
      const sb = createBrowserClient();
      const { error } = await sb
        .from("supply_house_contacts")
        .update({
          active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) throw new Error(error.message);
      await load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Update failed.",
        variant: "error",
      });
    } finally {
      setTogglingId(null);
    }
  };

  if (roleLoading || !allowed) {
    return null;
  }

  const formBlock = (
    <div className="space-y-3 rounded-lg border border-white/15 bg-[#071422]/80 p-3">
      <label className="block text-xs font-medium text-white/50">
        Name
        <input
          type="text"
          className={fieldClass}
          value={draft.name}
          onChange={(e) =>
            setDraft((d) => ({ ...d, name: e.target.value }))
          }
        />
      </label>
      <label className="block text-xs font-medium text-white/50">
        Contact name
        <input
          type="text"
          className={fieldClass}
          value={draft.contact_name}
          onChange={(e) =>
            setDraft((d) => ({ ...d, contact_name: e.target.value }))
          }
        />
      </label>
      <label className="block text-xs font-medium text-white/50">
        Email
        <input
          type="email"
          className={fieldClass}
          value={draft.email}
          onChange={(e) =>
            setDraft((d) => ({ ...d, email: e.target.value }))
          }
        />
      </label>
      <label className="block text-xs font-medium text-white/50">
        Subject override
        <input
          type="text"
          className={fieldClass}
          placeholder="Leave blank for default"
          value={draft.subject_override}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              subject_override: e.target.value,
            }))
          }
        />
        <span className="mt-1 block text-[10px] text-white/40">
          Use {"{title}"} for the request title.
        </span>
      </label>
      <label className="block text-xs font-medium text-white/50">
        Body closing override
        <textarea
          rows={2}
          className={`${fieldClass} resize-y`}
          placeholder="Leave blank for default"
          value={draft.body_closing_override}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              body_closing_override: e.target.value,
            }))
          }
        />
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-white/85">
        <input
          type="checkbox"
          className="rounded border-white/30"
          checked={draft.active}
          onChange={(e) =>
            setDraft((d) => ({ ...d, active: e.target.checked }))
          }
        />
        Active
      </label>
      <label className="block text-xs font-medium text-white/50">
        Sort order
        <input
          type="number"
          className={fieldClass}
          value={draft.sort_order}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              sort_order: Number(e.target.value),
            }))
          }
        />
      </label>
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          className="rounded-lg border border-[#E8C84A]/45 bg-[#E8C84A]/15 px-3 py-1.5 text-xs font-bold text-[#E8C84A] hover:bg-[#E8C84A]/25 disabled:opacity-50"
          disabled={saveBusy}
          onClick={() => void save()}
        >
          {saveBusy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/75 hover:bg-white/10"
          disabled={saveBusy}
          onClick={resetForm}
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-white/15 bg-[#0a1628] p-4 text-white sm:p-6">
      <h2 className="text-lg font-semibold text-white">
        Supply House Contacts
      </h2>
      <p className="mt-1 text-xs text-white/50">
        Material-order email targets for the dashboard widget. Use{" "}
        <code className="rounded bg-black/30 px-1 text-[10px]">
          {"{title}"}
        </code>{" "}
        in subject override when needed.
      </p>

      {loadBusy ? (
        <div className="mt-4 h-24 animate-pulse rounded-lg bg-white/10" />
      ) : (
        <div className="mt-4 space-y-3">
          {rows.length === 0 && !addingNew ? (
            <p className="text-sm text-white/45">No contacts yet.</p>
          ) : null}
          {rows.map((row) =>
            editingId === row.id ? (
              <div key={row.id}>{formBlock}</div>
            ) : (
              <div
                key={row.id}
                className="flex flex-col gap-2 rounded-lg border border-white/15 bg-[#071422]/50 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                  <p className="font-medium text-white">{row.name}</p>
                  <p className="text-xs text-white/55">
                    {row.contact_name ?? "—"}
                  </p>
                  <p className="truncate text-xs text-sky-300/90">
                    {row.email}
                  </p>
                  <p className="text-[10px] text-white/40">
                    Sort: {row.sort_order}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-white/75">
                    <input
                      type="checkbox"
                      className="rounded border-white/30"
                      checked={row.active}
                      disabled={togglingId === row.id}
                      onChange={(e) =>
                        void toggleActive(row, e.target.checked)
                      }
                    />
                    Active
                  </label>
                  <button
                    type="button"
                    className="rounded-lg border border-white/20 px-2.5 py-1 text-xs font-semibold text-[#E8C84A] hover:bg-white/10"
                    disabled={editingId !== null || addingNew}
                    onClick={() => {
                      setEditingId(row.id);
                      setAddingNew(false);
                      setDraft(draftFromRow(row));
                    }}
                  >
                    Edit
                  </button>
                </div>
              </div>
            ),
          )}
          {addingNew ? <div>{formBlock}</div> : null}
        </div>
      )}

      {!loadBusy ? (
        <div className="mt-4">
          <button
            type="button"
            className="rounded-lg border border-sky-400/40 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/10 disabled:opacity-50"
            disabled={editingId !== null || addingNew}
            onClick={() => {
              setAddingNew(true);
              setEditingId(null);
              setDraft(emptyDraft());
            }}
          >
            Add supply house
          </button>
        </div>
      ) : null}
    </div>
  );
}
