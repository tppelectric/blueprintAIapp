"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import { createBrowserClient } from "@/lib/supabase/client";
import type { UserProfileRow } from "@/lib/user-profile-types";
import { userDisplayName } from "@/lib/user-display-name";
import { ROLE_LABELS, type UserRole } from "@/lib/user-roles";

function parseProfileRow(r: Record<string, unknown>): UserProfileRow | null {
  const id = typeof r.id === "string" ? r.id : null;
  const email = typeof r.email === "string" ? r.email : null;
  const roleRaw = typeof r.role === "string" ? r.role : null;
  const role =
    roleRaw === "super_admin" ||
    roleRaw === "admin" ||
    roleRaw === "estimator" ||
    roleRaw === "field_tech" ||
    roleRaw === "office_manager"
      ? (roleRaw as UserRole)
      : null;
  if (!id || !email || !role) return null;
  return {
    id,
    email,
    full_name:
      typeof r.full_name === "string" ? r.full_name : String(r.full_name ?? ""),
    first_name:
      r.first_name == null ? "" : String(r.first_name as string | number),
    last_name:
      r.last_name == null ? "" : String(r.last_name as string | number),
    employee_number:
      r.employee_number == null
        ? ""
        : String(r.employee_number as string | number),
    role,
    is_active: typeof r.is_active === "boolean" ? r.is_active : true,
    show_punch_interface:
      typeof r.show_punch_interface === "boolean"
        ? r.show_punch_interface
        : false,
    created_at:
      typeof r.created_at === "string" ? r.created_at : new Date().toISOString(),
    updated_at:
      typeof r.updated_at === "string" ? r.updated_at : new Date().toISOString(),
  };
}

function displayFullName(p: UserProfileRow): string {
  return userDisplayName({
    first_name: p.first_name,
    last_name: p.last_name,
    full_name: p.full_name,
    email: p.email,
  });
}

function avatarInitials(p: UserProfileRow): string {
  const fn = p.first_name.trim();
  const ln = p.last_name.trim();
  if (fn[0] && ln[0]) return (fn[0] + ln[0]).toUpperCase();
  if (fn[0]) return fn[0]!.toUpperCase();
  const full = p.full_name.trim();
  if (full) {
    const parts = full.split(/\s+/).filter(Boolean);
    if (parts.length >= 2 && parts[0]![0] && parts[1]![0]) {
      return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    }
    if (parts[0]?.[0]) return parts[0]![0]!.toUpperCase();
  }
  const local = p.email.split("@")[0]?.trim() ?? "";
  if (local[0]) return local[0]!.toUpperCase();
  return "?";
}

const cardClass =
  "rounded-xl border border-white/10 bg-white/[0.03] p-5";

export function ProfileClient() {
  const { showToast } = useAppToast();
  const { refresh } = useUserRole();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfileRow | null>(null);
  const [noUser, setNoUser] = useState(false);
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [pwdBusy, setPwdBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNoUser(false);
    try {
      const sb = createBrowserClient();
      const {
        data: { user },
        error: authErr,
      } = await sb.auth.getUser();
      if (authErr) throw authErr;
      if (!user?.id) {
        setProfile(null);
        setNoUser(true);
        return;
      }

      const { data: row, error: pe } = await sb
        .from("user_profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (pe || !row) {
        setProfile(null);
        showToast({
          message: pe?.message ?? "Could not load profile.",
          variant: "error",
        });
        return;
      }

      const parsed = parseProfileRow(row as Record<string, unknown>);
      setProfile(parsed);
      if (parsed) {
        setFirstName(parsed.first_name);
        setLastName(parsed.last_name);
      }
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Load failed.",
        variant: "error",
      });
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveNames = async () => {
    if (!profile) return;
    setSaveBusy(true);
    try {
      const sb = createBrowserClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user?.id) throw new Error("Not signed in.");

      const { error } = await sb
        .from("user_profiles")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        })
        .eq("id", user.id);

      if (error) throw error;

      showToast({ message: "Profile updated.", variant: "success" });
      setEditing(false);
      await load();
      await refresh();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Save failed.",
        variant: "error",
      });
    } finally {
      setSaveBusy(false);
    }
  };

  const sendPasswordReset = async () => {
    if (!profile?.email) return;
    setPwdBusy(true);
    try {
      const sb = createBrowserClient();
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const { error } = await sb.auth.resetPasswordForEmail(profile.email, {
        redirectTo: origin
          ? `${origin}/auth/callback?next=/reset-password`
          : undefined,
      });
      if (error) throw error;
      showToast({
        message: "Check your email for a password reset link.",
        variant: "success",
      });
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Request failed.",
        variant: "error",
      });
    } finally {
      setPwdBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="dashboard" showTppSubtitle />
      <main className="app-page-shell mx-auto w-full min-w-0 max-w-lg flex-1 py-8 md:py-10">
        <Link
          href="/dashboard"
          className="text-sm text-[#E8C84A] hover:underline"
        >
          ← Dashboard
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-white">My Profile</h1>

        {loading ? (
          <div className="mt-6 space-y-4">
            <div className={`${cardClass} animate-pulse`}>
              <div className="h-6 w-40 bg-white/10" />
              <div className="mt-4 h-16 w-16 rounded-full bg-white/10" />
            </div>
            <div className={`${cardClass} h-32 animate-pulse bg-white/[0.03]`} />
            <div className={`${cardClass} h-24 animate-pulse bg-white/[0.03]`} />
          </div>
        ) : noUser ? (
          <p className="mt-6 text-sm text-white/70">
            Sign in to view your profile.{" "}
            <Link href="/login" className="text-[#E8C84A] hover:underline">
              Log in
            </Link>
          </p>
        ) : !profile ? (
          <p className="mt-6 text-sm text-white/70">
            Profile could not be loaded.
          </p>
        ) : (
          <div className="mt-6 space-y-5">
            <section className={cardClass}>
              <h2 className="text-base font-semibold text-white">
                Personal Information
              </h2>
              <div className="mt-4 flex flex-wrap items-start gap-4">
                <div
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#E8C84A]/25 text-lg font-bold text-[#E8C84A] ring-2 ring-[#E8C84A]/40"
                  aria-hidden
                >
                  {avatarInitials(profile)}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-white/45">
                      Full name
                    </p>
                    <p className="text-sm text-white/88">
                      {displayFullName(profile)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-white/45">
                      Email
                    </p>
                    <p className="text-sm text-white/88">{profile.email}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-white/45">
                      Role
                    </p>
                    <span className="mt-1 inline-block rounded-md bg-[#E8C84A]/15 px-2 py-0.5 text-xs font-semibold text-[#E8C84A] ring-1 ring-[#E8C84A]/35">
                      {ROLE_LABELS[profile.role]}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 border-t border-white/10 pt-4">
                {!editing ? (
                  <button
                    type="button"
                    className="rounded-lg border border-[#E8C84A]/40 px-3 py-2 text-xs font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/10"
                    onClick={() => {
                      setFirstName(profile.first_name);
                      setLastName(profile.last_name);
                      setEditing(true);
                    }}
                  >
                    Edit name
                  </button>
                ) : (
                  <div className="space-y-3">
                    <label className="block text-xs text-white/50">
                      First name
                      <input
                        className="app-input mt-1 w-full text-sm"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                      />
                    </label>
                    <label className="block text-xs text-white/50">
                      Last name
                      <input
                        className="app-input mt-1 w-full text-sm"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-[#E8C84A] px-3 py-2 text-xs font-bold text-[#0a1628] disabled:opacity-50"
                        disabled={saveBusy}
                        onClick={() => void saveNames()}
                      >
                        {saveBusy ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-white/20 px-3 py-2 text-xs text-white/80"
                        disabled={saveBusy}
                        onClick={() => setEditing(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className={cardClass}>
              <h2 className="text-base font-semibold text-white">Account</h2>
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-white/45">
                    Email
                  </p>
                  <p className="text-sm text-white/88">{profile.email}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-white/45">
                    Role
                  </p>
                  <span className="mt-1 inline-block rounded-md bg-[#E8C84A]/15 px-2 py-0.5 text-xs font-semibold text-[#E8C84A] ring-1 ring-[#E8C84A]/35">
                    {ROLE_LABELS[profile.role]}
                  </span>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-white/45">
                    Account status
                  </p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${
                      profile.is_active
                        ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/35"
                        : "bg-white/10 text-white/50 ring-white/15"
                    }`}
                  >
                    {profile.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <button
                  type="button"
                  className="mt-2 rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white/90 hover:bg-white/10 disabled:opacity-50"
                  disabled={pwdBusy}
                  onClick={() => void sendPasswordReset()}
                >
                  {pwdBusy ? "Sending…" : "Change password"}
                </button>
              </div>
            </section>

            <section className={cardClass}>
              <h2 className="text-base font-semibold text-white">Activity</h2>
              <p className="mt-3 text-sm text-white/45">
                Activity summary coming soon
              </p>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
