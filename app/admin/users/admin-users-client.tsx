"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import type { AdminUserProfileRow } from "@/lib/user-profile-types";
import {
  formatLastLoginLabel,
  lastLoginToneClass,
} from "@/lib/format-last-login";
import { ROLE_LABELS, type UserRole } from "@/lib/user-roles";

const ROLES: UserRole[] = [
  "super_admin",
  "admin",
  "estimator",
  "field_tech",
  "office_manager",
];

export function AdminUsersClient() {
  const { canManageUsers, loading: roleLoading, profile: me } = useUserRole();
  const { showToast } = useAppToast();
  const [users, setUsers] = useState<AdminUserProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("estimator");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUserProfileRow | null>(
    null,
  );
  const [resetBusy, setResetBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/users", { credentials: "include" });
      const j = (await r.json()) as {
        users?: AdminUserProfileRow[];
        error?: string;
      };
      if (!r.ok) {
        setError(j.error ?? "Could not load users.");
        setUsers([]);
        return;
      }
      setUsers(j.users ?? []);
    } catch {
      setError("Could not load users.");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!roleLoading && canManageUsers) void load();
  }, [roleLoading, canManageUsers, load]);

  const patchUser = async (
    userId: string,
    patch: {
      role?: UserRole;
      is_active?: boolean;
      show_punch_interface?: boolean;
    },
  ) => {
    setError(null);
    const r = await fetch("/api/admin/users", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...patch }),
    });
    const j = (await r.json()) as { error?: string };
    if (!r.ok) {
      setError(j.error ?? "Update failed.");
      showToast({ message: j.error ?? "Update failed.", variant: "error" });
      return;
    }
    void load();
  };

  const sendInvite = async () => {
    setInviteMsg(null);
    setError(null);
    setInviteBusy(true);
    try {
      const r = await fetch("/api/admin/users/invite", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          full_name: inviteName.trim(),
          role: inviteRole,
        }),
      });
      const j = (await r.json()) as { error?: string; ok?: boolean };
      if (!r.ok) {
        setError(j.error ?? "Invite failed.");
        return;
      }
      setInviteMsg("Invitation sent.");
      setInviteEmail("");
      setInviteName("");
      setInviteRole("estimator");
      void load();
    } catch {
      setError("Invite failed.");
    } finally {
      setInviteBusy(false);
    }
  };

  const confirmSendReset = async () => {
    if (!resetTarget) return;
    setResetBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/users/reset-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: resetTarget.id }),
      });
      const j = (await r.json()) as { error?: string; email?: string };
      if (!r.ok) {
        showToast({
          message: j.error ?? "Could not send reset email.",
          variant: "error",
        });
        return;
      }
      showToast({
        message: `Password reset email sent to ${j.email ?? resetTarget.email}`,
        variant: "success",
      });
      setResetTarget(null);
    } catch {
      showToast({
        message: "Could not send reset email.",
        variant: "error",
      });
    } finally {
      setResetBusy(false);
    }
  };

  const formatCreated = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  if (roleLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="jobs" showTppSubtitle />
        <main className="p-10 text-white/60">Loading…</main>
      </div>
    );
  }

  if (!canManageUsers) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="jobs" showTppSubtitle />
        <main className="mx-auto max-w-lg flex-1 px-6 py-16 text-center">
          <p className="text-lg text-white/80">
            You don’t have access to user management.
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
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="jobs" showTppSubtitle />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <Link
          href="/dashboard"
          className="text-sm text-[#E8C84A] hover:underline"
        >
          ← Project Dashboard
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-white">
          User management
        </h1>
        <p className="mt-2 text-sm text-white/55">
          Super Admins can invite users, set roles, reset passwords, and
          activate or deactivate accounts.
        </p>

        <section className="mt-10 rounded-xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[#E8C84A]">
            Invite user
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-white/60 sm:col-span-2">
              Email
              <input
                type="email"
                className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-3 py-2 text-sm text-white"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="block text-xs text-white/60">
              Full name (optional)
              <input
                className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-3 py-2 text-sm text-white"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </label>
            <label className="block text-xs text-white/60">
              Role
              <select
                className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-3 py-2 text-sm text-white"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as UserRole)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            disabled={inviteBusy || !inviteEmail.trim()}
            onClick={() => void sendInvite()}
            className="mt-4 rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-semibold text-[#0a1628] disabled:opacity-40"
          >
            {inviteBusy ? "Sending…" : "Send invite"}
          </button>
          {inviteMsg ? (
            <p className="mt-2 text-sm text-emerald-200/90">{inviteMsg}</p>
          ) : null}
        </section>

        {error ? (
          <p className="mt-6 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}

        <section className="mt-10">
          <h2 className="text-sm font-bold uppercase tracking-wide text-white/50">
            All users
          </h2>
          <p className="mt-1 text-xs text-white/40">
            Sorted by last login (most recent first). Click a row for details.
          </p>
          {loading ? (
            <p className="mt-4 text-white/50">Loading…</p>
          ) : users.length === 0 ? (
            <p className="mt-4 text-white/50">No users found.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm text-white/88">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.06] text-[11px] font-bold uppercase tracking-wide text-[#E8C84A]">
                    <th className="w-8 px-2 py-3" aria-hidden />
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Name</th>
                    <th className="px-3 py-3">Last login</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const { label, tone } = formatLastLoginLabel(
                      u.last_sign_in_at,
                    );
                    const expanded = expandedId === u.id;
                    const isSelf = me?.id === u.id;
                    return (
                      <Fragment key={u.id}>
                        <tr
                          className={[
                            "border-b border-white/8 transition-colors",
                            expanded
                              ? "bg-white/[0.08]"
                              : "cursor-pointer odd:bg-white/[0.02] hover:bg-white/[0.05]",
                          ].join(" ")}
                          onClick={() =>
                            setExpandedId((id) => (id === u.id ? null : u.id))
                          }
                        >
                          <td className="px-2 py-3 text-white/50" aria-hidden>
                            {expanded ? "▼" : "▶"}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs">
                            {u.email}
                          </td>
                          <td className="px-3 py-3 text-white/70">
                            {u.full_name?.trim() || "—"}
                          </td>
                          <td
                            className={`px-3 py-3 text-xs font-medium ${lastLoginToneClass(tone)}`}
                          >
                            {label}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={
                                u.is_active
                                  ? "text-emerald-300/90"
                                  : "text-white/45"
                              }
                            >
                              {u.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td
                            className="px-3 py-3 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              title="Reset password"
                              onClick={() => setResetTarget(u)}
                              className="rounded border border-white/20 px-2 py-1 text-xs font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/10"
                            >
                              🔑 Reset
                            </button>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="border-b border-white/10 bg-[#071422]/80">
                            <td colSpan={6} className="px-4 py-4 sm:px-6">
                              <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">
                                    Full name
                                  </p>
                                  <p className="mt-1 text-sm text-white">
                                    {u.full_name?.trim() || "—"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">
                                    Email
                                  </p>
                                  <p className="mt-1 font-mono text-sm text-white">
                                    {u.email}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">
                                    Role
                                  </p>
                                  <select
                                    className="mt-1 max-w-full rounded border border-white/20 bg-[#0a1628] px-2 py-2 text-sm text-white"
                                    value={u.role}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                      void patchUser(u.id, {
                                        role: e.target.value as UserRole,
                                      })
                                    }
                                  >
                                    {ROLES.map((r) => (
                                      <option key={r} value={r}>
                                        {ROLE_LABELS[r]}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">
                                    Account status
                                  </p>
                                  <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={u.is_active}
                                      disabled={isSelf && u.is_active}
                                      title={
                                        isSelf
                                          ? "You cannot deactivate your own account here."
                                          : undefined
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) =>
                                        void patchUser(u.id, {
                                          is_active: e.target.checked,
                                        })
                                      }
                                    />
                                    <span className="text-white/75">
                                      {u.is_active ? "Active" : "Inactive"}
                                    </span>
                                  </label>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">
                                    Created
                                  </p>
                                  <p className="mt-1 text-sm text-white/80">
                                    {formatCreated(u.created_at)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">
                                    Last login
                                  </p>
                                  <p
                                    className={`mt-1 text-sm font-medium ${lastLoginToneClass(tone)}`}
                                  >
                                    {label}
                                  </p>
                                </div>
                                <div className="sm:col-span-2">
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">
                                    Time clock access
                                  </p>
                                  <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(u.show_punch_interface)}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) =>
                                        void patchUser(u.id, {
                                          show_punch_interface: e.target.checked,
                                        })
                                      }
                                    />
                                    <span className="text-white/75">
                                      ⏱ Time Clock Access —{" "}
                                      {u.show_punch_interface ? "ON" : "OFF"}
                                    </span>
                                  </label>
                                </div>
                              </div>
                              <div
                                className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => setResetTarget(u)}
                                  className="rounded-lg border border-[#E8C84A]/45 px-3 py-2 text-xs font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/10"
                                >
                                  Reset password
                                </button>
                                {u.is_active ? (
                                  <button
                                    type="button"
                                    disabled={isSelf}
                                    onClick={() =>
                                      void patchUser(u.id, {
                                        is_active: false,
                                      })
                                    }
                                    className="rounded-lg border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-950/35 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    Deactivate
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void patchUser(u.id, {
                                        is_active: true,
                                      })
                                    }
                                    className="rounded-lg border border-emerald-500/40 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-950/30"
                                  >
                                    Activate
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {resetTarget ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !resetBusy) setResetTarget(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0a1628] p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-pw-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="reset-pw-title"
              className="text-lg font-semibold text-white"
            >
              Reset password
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/75">
              Send password reset email to{" "}
              <span className="font-mono text-[#E8C84A]">
                {resetTarget.email}
              </span>
              ?
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={resetBusy}
                onClick={() => setResetTarget(null)}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white/85 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetBusy}
                onClick={() => void confirmSendReset()}
                className="rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-semibold text-[#0a1628] hover:bg-[#f0d56e] disabled:opacity-50"
              >
                {resetBusy ? "Sending…" : "Send reset email"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
