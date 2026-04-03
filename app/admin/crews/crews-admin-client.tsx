"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import {
  CREW_COLORS,
  type CrewWithMembers,
} from "@/lib/crew-types";
import { createBrowserClient } from "@/lib/supabase/client";
import { userAssigneeOptionLabel, userDisplayName } from "@/lib/user-display-name";
import {
  ROLE_LABELS,
  parseUserRole,
  type UserRole,
} from "@/lib/user-roles";

type AssigneeOption = {
  id: string;
  email: string;
  full_name: string;
  first_name: string;
  last_name: string;
  role: string;
};

type VehicleAsset = {
  id: string;
  name: string | null;
  asset_number: string | null;
  asset_type: string | null;
};

function vehicleLabel(v: VehicleAsset): string {
  const num = (v.asset_number ?? "").trim();
  const n = (v.name ?? "").trim();
  if (num && n) return `${num} · ${n}`;
  return num || n || "—";
}

function sharedDefaultVehicleIds(crews: CrewWithMembers[]): Set<string> {
  const counts = new Map<string, number>();
  for (const c of crews) {
    const vid = c.default_vehicle_id;
    if (!vid) continue;
    counts.set(vid, (counts.get(vid) ?? 0) + 1);
  }
  return new Set(
    [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id),
  );
}

function roleLabel(role: string | null): string {
  if (!role) return "—";
  const r = parseUserRole(role);
  if (!r) return role;
  return ROLE_LABELS[r as UserRole] ?? role;
}

function collapsedMembersLine(c: CrewWithMembers): string | null {
  if (c.members.length === 0) return null;
  return c.members
    .map((m) => {
      const crown = c.lead_user_id === m.user_id ? "👑 " : "";
      return `${crown}${m.display_name}`;
    })
    .join(", ");
}

const inputClass =
  "w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white focus:border-[#E8C84A]/50 focus:outline-none";

export function CrewsAdminClient() {
  const { role, loading: roleLoading } = useUserRole();
  const canManageCrews =
    !roleLoading && (role === "admin" || role === "super_admin");
  const { showToast } = useAppToast();
  const [crews, setCrews] = useState<CrewWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleAsset[]>([]);
  const [patchBusyId, setPatchBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string>(CREW_COLORS[0].value);
  const [editLeadId, setEditLeadId] = useState<string | null>(null);
  const [editVehicleId, setEditVehicleId] = useState<string>("");
  const [editNotes, setEditNotes] = useState("");

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(CREW_COLORS[0].value);
  const [newLeadId, setNewLeadId] = useState<string | null>(null);
  const [newVehicleId, setNewVehicleId] = useState<string>("");
  const [newNotes, setNewNotes] = useState("");

  const [leadSearch, setLeadSearch] = useState<Record<string, string>>({});
  const [leadOpen, setLeadOpen] = useState<Record<string, boolean>>({});
  const [memberSearch, setMemberSearch] = useState<Record<string, string>>({});
  const [memberOpen, setMemberOpen] = useState<Record<string, boolean>>({});

  const sharedTrucks = useMemo(
    () => sharedDefaultVehicleIds(crews),
    [crews],
  );

  const loadCrews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/crews", { credentials: "include" });
      const j = (await r.json()) as {
        crews?: CrewWithMembers[];
        error?: string;
      };
      if (!r.ok) {
        setError(j.error ?? "Could not load crews.");
        setCrews([]);
        return;
      }
      setCrews(j.crews ?? []);
    } catch {
      setError("Could not load crews.");
      setCrews([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManageCrews) void loadCrews();
  }, [canManageCrews, loadCrews, refreshTick]);

  useEffect(() => {
    if (!canManageCrews) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/users/for-assignment", {
          credentials: "include",
        });
        const j = (await r.json()) as { users?: AssigneeOption[] };
        if (!cancelled && r.ok && j.users) setAssignees(j.users);
      } catch {
        if (!cancelled) setAssignees([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManageCrews]);

  useEffect(() => {
    if (!canManageCrews) return;
    let cancelled = false;
    void (async () => {
      try {
        const sb = createBrowserClient();
        const { data, error: qErr } = await sb
          .from("assets")
          .select("id,name,asset_number,asset_type")
          .or("asset_type.ilike.%vehicle%,asset_type.ilike.%truck%")
          .order("asset_number", { ascending: true });
        if (!cancelled && !qErr && data) {
          setVehicles(data as VehicleAsset[]);
        }
      } catch {
        if (!cancelled) setVehicles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManageCrews]);

  const openExpanded = (c: CrewWithMembers) => {
    if (expandedId === c.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(c.id);
    setEditName(c.name);
    setEditColor(
      CREW_COLORS.some((x) => x.value === c.color) ? c.color : CREW_COLORS[0].value,
    );
    setEditLeadId(c.lead_user_id);
    setEditVehicleId(c.default_vehicle_id ?? "");
    setEditNotes(c.notes ?? "");
  };

  const leadKey = (id: string | "new") => (id === "new" ? "__new__" : id);

  const filterAssignees = (q: string, list: AssigneeOption[]) => {
    const s = q.toLowerCase().trim();
    if (s.length < 1) return [];
    return list
      .filter((u) => {
        const label = userAssigneeOptionLabel(u).toLowerCase();
        const email = (u.email ?? "").toLowerCase();
        return label.includes(s) || email.includes(s);
      })
      .slice(0, 8);
  };

  const saveCrew = async (crewId: string) => {
    setPatchBusyId(crewId);
    try {
      const r = await fetch(`/api/crews/${crewId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          color: editColor,
          lead_user_id: editLeadId,
          default_vehicle_id: editVehicleId.trim() || null,
          notes: editNotes.trim() || null,
        }),
      });
      const j = (await r.json()) as { crew?: CrewWithMembers; error?: string };
      if (!r.ok) {
        showToast({
          message: j.error ?? "Save failed.",
          variant: "error",
        });
        return;
      }
      if (j.crew) {
        setCrews((prev) => prev.map((c) => (c.id === crewId ? j.crew! : c)));
      }
      showToast({ message: "Crew saved.", variant: "success" });
      setRefreshTick((t) => t + 1);
    } catch {
      showToast({ message: "Save failed.", variant: "error" });
    } finally {
      setPatchBusyId(null);
    }
  };

  const deactivateCrew = async (crewId: string) => {
    setPatchBusyId(crewId);
    try {
      const r = await fetch(`/api/crews/${crewId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        showToast({
          message: j.error ?? "Could not deactivate.",
          variant: "error",
        });
        return;
      }
      setCrews((prev) => prev.filter((c) => c.id !== crewId));
      if (expandedId === crewId) setExpandedId(null);
      showToast({ message: "Crew deactivated.", variant: "success" });
      setRefreshTick((t) => t + 1);
    } catch {
      showToast({ message: "Could not deactivate.", variant: "error" });
    } finally {
      setPatchBusyId(null);
    }
  };

  const addMember = async (crewId: string, userId: string) => {
    const addUser = assignees.find((u) => u.id === userId);
    setPatchBusyId(crewId);
    if (addUser) {
      setCrews((prev) =>
        prev.map((c) => {
          if (c.id !== crewId) return c;
          if (c.members.some((m) => m.user_id === userId)) return c;
          return {
            ...c,
            members: [
              ...c.members,
              {
                user_id: userId,
                display_name: userDisplayName({
                  first_name: addUser.first_name,
                  last_name: addUser.last_name,
                  full_name: addUser.full_name,
                  email: addUser.email,
                }),
                role: addUser.role ?? null,
              },
            ],
            member_count: c.member_count + 1,
          };
        }),
      );
    }
    setMemberSearch((p) => ({ ...p, [crewId]: "" }));
    setMemberOpen((p) => ({ ...p, [crewId]: false }));
    try {
      const r = await fetch(`/api/crews/${crewId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ add_member_ids: [userId] }),
      });
      const j = (await r.json()) as { crew?: CrewWithMembers; error?: string };
      if (!r.ok) {
        showToast({
          message: j.error ?? "Could not add member.",
          variant: "error",
        });
        setRefreshTick((t) => t + 1);
        return;
      }
      if (j.crew) {
        setCrews((prev) => prev.map((c) => (c.id === crewId ? j.crew! : c)));
      }
      showToast({ message: "Member added.", variant: "success" });
      setRefreshTick((t) => t + 1);
    } catch {
      showToast({ message: "Could not add member.", variant: "error" });
      setRefreshTick((t) => t + 1);
    } finally {
      setPatchBusyId(null);
    }
  };

  const removeMember = async (crewId: string, userId: string) => {
    setPatchBusyId(crewId);
    let clearingLead = false;
    setCrews((prev) =>
      prev.map((c) => {
        if (c.id !== crewId) return c;
        clearingLead = c.lead_user_id === userId;
        return {
          ...c,
          members: c.members.filter((m) => m.user_id !== userId),
          member_count: Math.max(0, c.member_count - 1),
          ...(clearingLead
            ? { lead_user_id: null as string | null, lead_name: null as string | null }
            : {}),
        };
      }),
    );
    if (expandedId === crewId && clearingLead) setEditLeadId(null);
    try {
      const r = await fetch(`/api/crews/${crewId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          clearingLead
            ? { remove_member_ids: [userId], lead_user_id: null }
            : { remove_member_ids: [userId] },
        ),
      });
      const j = (await r.json()) as { crew?: CrewWithMembers; error?: string };
      if (!r.ok) {
        showToast({
          message: j.error ?? "Could not remove member.",
          variant: "error",
        });
        setRefreshTick((t) => t + 1);
        return;
      }
      if (j.crew) {
        setCrews((prev) => prev.map((c) => (c.id === crewId ? j.crew! : c)));
      }
      showToast({ message: "Member removed.", variant: "success" });
      setRefreshTick((t) => t + 1);
    } catch {
      showToast({ message: "Could not remove member.", variant: "error" });
      setRefreshTick((t) => t + 1);
    } finally {
      setPatchBusyId(null);
    }
  };

  const setCrewLead = async (crewId: string, userId: string) => {
    setPatchBusyId(crewId);
    try {
      const r = await fetch(`/api/crews/${crewId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_user_id: userId }),
      });
      const j = (await r.json()) as { crew?: CrewWithMembers; error?: string };
      if (!r.ok) {
        showToast({
          message: j.error ?? "Could not set lead.",
          variant: "error",
        });
        setRefreshTick((t) => t + 1);
        return;
      }
      if (j.crew) {
        setCrews((prev) => prev.map((c) => (c.id === crewId ? j.crew! : c)));
        if (expandedId === crewId) setEditLeadId(j.crew.lead_user_id);
      }
      setRefreshTick((t) => t + 1);
    } catch {
      showToast({ message: "Could not set lead.", variant: "error" });
      setRefreshTick((t) => t + 1);
    } finally {
      setPatchBusyId(null);
    }
  };

  const createCrew = async () => {
    const name = newName.trim();
    if (!name) {
      showToast({ message: "Name is required.", variant: "error" });
      return;
    }
    setCreating(true);
    try {
      const r = await fetch("/api/crews", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          color: newColor,
          lead_user_id: newLeadId,
          default_vehicle_id: newVehicleId.trim() || null,
          notes: newNotes.trim() || null,
        }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        showToast({
          message: j.error ?? "Could not create crew.",
          variant: "error",
        });
        return;
      }
      showToast({ message: "Crew created.", variant: "success" });
      setShowNewForm(false);
      setNewName("");
      setNewColor(CREW_COLORS[0].value);
      setNewLeadId(null);
      setNewVehicleId("");
      setNewNotes("");
      setLeadSearch((p) => ({ ...p, __new__: "" }));
      setLeadOpen((p) => ({ ...p, __new__: false }));
      setRefreshTick((t) => t + 1);
    } catch {
      showToast({ message: "Could not create crew.", variant: "error" });
    } finally {
      setCreating(false);
    }
  };

  const renderLeadCombobox = (mode: "edit" | "new") => {
    const key = leadKey(mode === "new" ? "new" : expandedId ?? "");
    const selectedId = mode === "new" ? newLeadId : editLeadId;
    const selected = selectedId
      ? assignees.find((u) => u.id === selectedId)
      : null;
    const q = leadSearch[key] ?? "";
    const open = leadOpen[key] ?? false;
    const filtered = filterAssignees(q, assignees);

    return (
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-white/40">
          Lead tech
        </p>
        {selected && !open ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-white/80">
              {userAssigneeOptionLabel(selected)}
            </span>
            <button
              type="button"
              className="text-xs text-[#E8C84A] hover:underline"
              onClick={() => {
                if (mode === "new") setNewLeadId(null);
                else setEditLeadId(null);
              }}
            >
              Clear
            </button>
          </div>
        ) : null}
        <input
          type="text"
          className={inputClass}
          placeholder="Search users…"
          value={q}
          onChange={(e) => {
            setLeadSearch((p) => ({ ...p, [key]: e.target.value }));
            setLeadOpen((p) => ({ ...p, [key]: true }));
          }}
          onFocus={() => setLeadOpen((p) => ({ ...p, [key]: true }))}
          onBlur={() =>
            setTimeout(
              () => setLeadOpen((p) => ({ ...p, [key]: false })),
              150,
            )
          }
        />
        {open && filtered.length > 0 ? (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-lg border border-white/15 bg-[#0a1628] shadow-xl">
            {filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-white/[0.06]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (mode === "new") setNewLeadId(u.id);
                  else setEditLeadId(u.id);
                  setLeadSearch((p) => ({ ...p, [key]: "" }));
                  setLeadOpen((p) => ({ ...p, [key]: false }));
                }}
              >
                {userAssigneeOptionLabel(u)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const renderMemberAddCombobox = (crew: CrewWithMembers) => {
    const memberIds = new Set(crew.members.map((m) => m.user_id));
    const available = assignees.filter(
      (u) => u.id && !memberIds.has(u.id),
    );
    const q = memberSearch[crew.id] ?? "";
    const open = memberOpen[crew.id] ?? false;
    const filtered = filterAssignees(q, available);

    return (
      <div className="relative mt-3" onClick={(e) => e.stopPropagation()}>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-white/40">
          Add technician
        </p>
        <input
          type="text"
          className={inputClass}
          placeholder="Search users not on this crew…"
          value={q}
          onChange={(e) => {
            setMemberSearch((p) => ({ ...p, [crew.id]: e.target.value }));
            setMemberOpen((p) => ({ ...p, [crew.id]: true }));
          }}
          onFocus={() =>
            setMemberOpen((p) => ({ ...p, [crew.id]: true }))
          }
          onBlur={() =>
            setTimeout(
              () =>
                setMemberOpen((p) => ({ ...p, [crew.id]: false })),
              150,
            )
          }
        />
        {open && filtered.length > 0 ? (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-lg border border-white/15 bg-[#0a1628] shadow-xl">
            {filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-white/[0.06]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void addMember(crew.id, u.id)}
              >
                {userAssigneeOptionLabel(u)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  if (!roleLoading && !canManageCrews) {
    return (
      <div className="flex min-h-screen flex-col bg-[#0a1628]">
        <WideAppHeader active="jobs" showTppSubtitle />
        <main className="mx-auto max-w-lg flex-1 px-6 py-16 text-center">
          <p className="text-lg text-white/80">
            You don’t have access to crew management.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block text-[#E8C84A] hover:underline"
          >
            ← Project Dashboard
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0a1628]">
      <WideAppHeader active="jobs" showTppSubtitle />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <Link
          href="/dashboard"
          className="text-sm text-[#E8C84A] hover:underline"
        >
          ← Project Dashboard
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold text-white">
            Crew Management
          </h1>
          <button
            type="button"
            onClick={() => setShowNewForm((v) => !v)}
            className="rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-semibold text-[#0a1628] hover:bg-[#f0d56e]"
          >
            {showNewForm ? "Close" : "New Crew"}
          </button>
        </div>
        <p className="mt-2 text-sm text-white/55">
          Organize field teams, leads, and default trucks. Deactivated crews
          are hidden from this list.
        </p>

        {showNewForm ? (
          <section className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[#E8C84A]">
              New crew
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-xs text-white/60 sm:col-span-2">
                Name *
                <input
                  className={`mt-1 ${inputClass}`}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </label>
              <div className="sm:col-span-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">
                  Color
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CREW_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      title={c.label}
                      onClick={() => setNewColor(c.value)}
                      className={`h-5 w-5 rounded-full border border-white/20 transition ${
                        newColor === c.value
                          ? "ring-2 ring-white ring-offset-1 ring-offset-[#0a1628]"
                          : ""
                      }`}
                      style={{ backgroundColor: c.value }}
                    />
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">{renderLeadCombobox("new")}</div>
              <label className="block text-xs text-white/60 sm:col-span-2">
                Default vehicle
                <div className="relative mt-1">
                  <select
                    className="w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white focus:border-[#E8C84A]/50 focus:outline-none appearance-none cursor-pointer pr-7"
                    value={newVehicleId}
                    onChange={(e) => setNewVehicleId(e.target.value)}
                  >
                    <option value="">— None —</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {vehicleLabel(v)}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-white/40 text-xs">
                    ▾
                  </span>
                </div>
              </label>
              <label className="block text-xs text-white/60 sm:col-span-2">
                Notes
                <textarea
                  rows={3}
                  className={`mt-1 resize-none ${inputClass}`}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={creating || !newName.trim()}
                onClick={() => void createCrew()}
                className="rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-semibold text-[#0a1628] disabled:opacity-40"
              >
                {creating ? "Creating…" : "Create crew"}
              </button>
              <button
                type="button"
                onClick={() => setShowNewForm(false)}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/70 hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </section>
        ) : null}

        {error ? (
          <p className="mt-6 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}

        <section className="mt-10">
          <h2 className="text-sm font-bold uppercase tracking-wide text-white/50">
            Active crews
          </h2>
          {loading ? (
            <p className="mt-4 text-white/50">Loading…</p>
          ) : crews.length === 0 ? (
            <p className="mt-4 text-white/50">No active crews yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {crews.map((c) => {
                const expanded = expandedId === c.id;
                const truckShared =
                  c.default_vehicle_id &&
                  sharedTrucks.has(c.default_vehicle_id);
                const membersLine = collapsedMembersLine(c);
                return (
                  <li key={c.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openExpanded(c);
                        }
                      }}
                      onClick={() => openExpanded(c)}
                      className={`cursor-pointer rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20 ${
                        expanded ? "border-[#E8C84A]/35" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-start gap-3">
                        <span
                          className="mt-1 h-3 w-3 shrink-0 rounded-full ring-1 ring-white/20"
                          style={{ backgroundColor: c.color }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-bold text-white">
                              {c.name}
                            </span>
                            <span className="rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-white/70">
                              {c.member_count} member
                              {c.member_count === 1 ? "" : "s"}
                            </span>
                            {truckShared ? (
                              <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                                ⚠ Shared truck
                              </span>
                            ) : null}
                          </div>
                          {membersLine ? (
                            <p className="mt-1 text-xs text-white/50">
                              {membersLine}
                            </p>
                          ) : null}
                          {c.vehicle_name ? (
                            <p
                              className={`text-xs text-white/45 ${
                                membersLine ? "mt-0.5" : "mt-1"
                              }`}
                            >
                              Truck: {c.vehicle_name}
                            </p>
                          ) : null}
                        </div>
                        <span className="text-white/40" aria-hidden>
                          {expanded ? "▼" : "▶"}
                        </span>
                      </div>

                      {expanded ? (
                        <div
                          className="mt-4 border-t border-white/10 pt-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="grid gap-4 sm:grid-cols-2">
                            <label className="block text-xs text-white/60 sm:col-span-2">
                              Name
                              <input
                                className={`mt-1 ${inputClass}`}
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                              />
                            </label>
                            <div className="sm:col-span-2">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">
                                Color
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {CREW_COLORS.map((col) => (
                                  <button
                                    key={col.value}
                                    type="button"
                                    title={col.label}
                                    onClick={() => setEditColor(col.value)}
                                    className={`h-5 w-5 rounded-full border border-white/20 transition ${
                                      editColor === col.value
                                        ? "ring-2 ring-white ring-offset-1 ring-offset-[#0a1628]"
                                        : ""
                                    }`}
                                    style={{ backgroundColor: col.value }}
                                  />
                                ))}
                              </div>
                            </div>
                            <label className="block text-xs text-white/60 sm:col-span-2">
                              Default vehicle
                              <div className="relative mt-1">
                                <select
                                  className="w-full rounded-lg border border-white/15 bg-[#071422] px-3 py-2 text-sm text-white focus:border-[#E8C84A]/50 focus:outline-none appearance-none cursor-pointer pr-7"
                                  value={editVehicleId}
                                  onChange={(e) =>
                                    setEditVehicleId(e.target.value)
                                  }
                                >
                                  <option value="">— None —</option>
                                  {vehicles.map((v) => (
                                    <option key={v.id} value={v.id}>
                                      {vehicleLabel(v)}
                                    </option>
                                  ))}
                                </select>
                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-white/40 text-xs">
                                  ▾
                                </span>
                              </div>
                            </label>
                            <label className="block text-xs text-white/60 sm:col-span-2">
                              Notes
                              <textarea
                                rows={3}
                                className={`mt-1 resize-none ${inputClass}`}
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                              />
                            </label>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={patchBusyId === c.id}
                              onClick={() => void saveCrew(c.id)}
                              className="rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-semibold text-[#0a1628] disabled:opacity-40"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              disabled={patchBusyId === c.id}
                              onClick={() => void deactivateCrew(c.id)}
                              className="rounded-lg border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/10 disabled:opacity-40"
                            >
                              Deactivate
                            </button>
                          </div>

                          <div className="mt-6 border-t border-white/10 pt-4">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">
                              Technicians
                            </p>
                            <ul className="mt-2 space-y-2">
                              {c.members.map((m) => {
                                const isLead =
                                  c.lead_user_id === m.user_id;
                                return (
                                  <li
                                    key={m.user_id}
                                    className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-[#071422]/60 px-3 py-2"
                                  >
                                    <span
                                      className="h-2 w-2 shrink-0 rounded-full"
                                      style={{ backgroundColor: c.color }}
                                      aria-hidden
                                    />
                                    <span className="min-w-0 flex-1 text-sm text-white/85">
                                      {m.display_name}
                                    </span>
                                    <span className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-white/55">
                                      {roleLabel(m.role)}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={patchBusyId === c.id}
                                      onClick={() =>
                                        void setCrewLead(c.id, m.user_id)
                                      }
                                      className={`shrink-0 rounded-lg px-2 py-0.5 text-xs transition ${
                                        isLead
                                          ? "border border-[#E8C84A]/40 bg-[#E8C84A]/20 text-[#E8C84A]"
                                          : "border border-white/15 text-white/40"
                                      }`}
                                    >
                                      {isLead ? "👑 Lead" : "👑"}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={patchBusyId === c.id}
                                      className="shrink-0 rounded border border-white/20 px-2 py-0.5 text-xs text-white/60 hover:bg-white/10 disabled:opacity-40"
                                      onClick={() =>
                                        void removeMember(c.id, m.user_id)
                                      }
                                    >
                                      ✕
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                            {renderMemberAddCombobox(c)}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
