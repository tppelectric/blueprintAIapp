"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";
import { ROLE_LABELS, canManageIntegrations } from "@/lib/user-roles";

export function HeaderAuthMenu() {
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const { role, loading: roleLoading } = useUserRole();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sb = createBrowserClient();
    let cancelled = false;

    const loadFullName = async (userId: string) => {
      const client = createBrowserClient();
      const { data, error } = await client
        .from("user_profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setFullName(null);
        return;
      }
      const fn =
        typeof data?.full_name === "string" ? data.full_name.trim() : "";
      setFullName(fn || null);
    };

    const applySession = (session: {
      user?: { id?: string; email?: string | null } | null;
    } | null) => {
      if (cancelled) return;
      setEmail(session?.user?.email ?? null);
      const uid = session?.user?.id;
      if (uid) void loadFullName(uid);
      else setFullName(null);
      setReady(true);
    };

    void sb.auth.getSession().then(({ data }) => {
      applySession(data.session);
    });
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_e, session) => {
      applySession(session);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const signOut = useCallback(async () => {
    if (
      !window.confirm(
        "Sign out of Blueprint AI? You will need to sign in again to continue.",
      )
    ) {
      return;
    }
    const sb = createBrowserClient();
    await sb.auth.signOut();
    window.location.href = "/login";
  }, []);

  if (!ready) {
    return (
      <div
        className="h-8 w-20 animate-pulse rounded bg-white/10"
        aria-hidden
      />
    );
  }

  if (!email) {
    return null;
  }

  const roleLabel =
    !roleLoading && role ? ROLE_LABELS[role] : roleLoading ? "…" : null;
  const showUserManagement = !roleLoading && role === "super_admin";
  const showCrewManagement =
    !roleLoading && (role === "admin" || role === "super_admin");
  const showSettings = !roleLoading && canManageIntegrations(role);

  const displayName = fullName?.trim() || email || "";
  const triggerTitle =
    fullName?.trim() && email
      ? `${fullName.trim()} — ${email}`
      : displayName || undefined;

  return (
    <div className="relative max-w-[16rem] sm:max-w-md" ref={wrapRef}>
      <button
        type="button"
        className="flex w-full max-w-full flex-col items-end gap-0.5 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-right transition-colors hover:bg-white/10"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="truncate text-xs text-white/70" title={triggerTitle}>
          {displayName}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-white/55">
          {roleLabel ? (
            <>
              <span className="rounded bg-[#E8C84A]/15 px-1.5 py-0.5 font-medium text-[#E8C84A]">
                {roleLabel}
              </span>
            </>
          ) : null}
          <span className="text-[10px] opacity-80" aria-hidden>
            {open ? "▲" : "▼"}
          </span>
        </span>
      </button>

      <div
        className={[
          "absolute right-0 top-full z-[70] mt-2 w-[min(100vw-2rem,14rem)] overflow-hidden rounded-xl border border-white/15 bg-[#0a1628] py-2 shadow-xl transition-opacity duration-200 ease-out",
          open
            ? "pointer-events-auto visible opacity-100"
            : "pointer-events-none invisible opacity-0",
        ].join(" ")}
        role="menu"
        aria-hidden={!open}
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="border-b border-white/10 px-3 pb-2 pt-1">
          <p className="break-all text-xs font-medium text-white/90">
            {displayName}
          </p>
          {fullName?.trim() && email ? (
            <p className="mt-0.5 break-all text-[11px] text-white/45">
              {email}
            </p>
          ) : null}
          {roleLabel ? (
            <p className="mt-1 text-[11px] text-white/55">
              Role:{" "}
              <span className="font-semibold text-[#E8C84A]">{roleLabel}</span>
            </p>
          ) : null}
        </div>
        <Link
          href="/profile"
          role="menuitem"
          className="block px-3 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10"
          onClick={() => setOpen(false)}
        >
          My Profile
        </Link>
        {showSettings ? (
          <Link
            href="/settings/integrations"
            role="menuitem"
            className="block px-3 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
        ) : null}
        {showUserManagement ? (
          <Link
            href="/admin/users"
            role="menuitem"
            className="block px-3 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10"
            onClick={() => setOpen(false)}
          >
            User Management
          </Link>
        ) : null}
        {showCrewManagement ? (
          <Link
            href="/admin/crews"
            role="menuitem"
            className="block px-3 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10"
            onClick={() => setOpen(false)}
          >
            Crews
          </Link>
        ) : null}
        <button
          type="button"
          role="menuitem"
          onClick={() => void signOut()}
          className="w-full border-t border-white/10 px-3 py-2.5 text-left text-sm font-semibold text-[#E8C84A] transition-colors hover:bg-[#E8C84A]/10"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
