"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { WideAppHeader } from "@/components/wide-app-header";
import { useUserRole } from "@/hooks/use-user-role";
import type { UserProfileRow } from "@/lib/user-profile-types";
import { ROLE_LABELS, type UserRole } from "@/lib/user-roles";

const ROLES: UserRole[] = [
  "super_admin",
  "admin",
  "estimator",
  "field_tech",
  "office_manager",
];

export function AdminUsersClient() {
  const { canManageUsers, loading: roleLoading } = useUserRole();
  const [users, setUsers] = useState<UserProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("estimator");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/users", { credentials: "include" });
      const j = (await r.json()) as { users?: UserProfileRow[]; error?: string };
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
    patch: { role?: UserRole; is_active?: boolean },
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
          <p className="text-lg text-white/80">You don’t have access to user management.</p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block text-[#E8C84A] hover:underline"
          >
            ← Dashboard
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="jobs" showTppSubtitle />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <Link
          href="/dashboard"
          className="text-sm text-[#E8C84A] hover:underline"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-white">User management</h1>
        <p className="mt-2 text-sm text-white/55">
          Super Admins can invite users, set roles, and activate or deactivate accounts.
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
          {loading ? (
            <p className="mt-4 text-white/50">Loading…</p>
          ) : users.length === 0 ? (
            <p className="mt-4 text-white/50">No users found.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm text-white/88">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.06] text-[11px] font-bold uppercase tracking-wide text-[#E8C84A]">
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Name</th>
                    <th className="px-3 py-3">Role</th>
                    <th className="px-3 py-3">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-white/8 odd:bg-white/[0.02]"
                    >
                      <td className="px-3 py-3 font-mono text-xs">{u.email}</td>
                      <td className="px-3 py-3 text-white/70">{u.full_name || "—"}</td>
                      <td className="px-3 py-3">
                        <select
                          className="max-w-[11rem] rounded border border-white/20 bg-[#0a1628] px-2 py-1.5 text-xs text-white"
                          value={u.role}
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
                      </td>
                      <td className="px-3 py-3">
                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={u.is_active}
                            onChange={(e) =>
                              void patchUser(u.id, {
                                is_active: e.target.checked,
                              })
                            }
                          />
                          <span className="text-white/60">
                            {u.is_active ? "Active" : "Inactive"}
                          </span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
