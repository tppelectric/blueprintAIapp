"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import type { UserProfileRow } from "@/lib/user-profile-types";
import {
  canAccessFinancialTools,
  canAssignJobs,
  canCreateOrEditJobs,
  canDeleteJobs,
  canManageReferenceDocuments,
  canManageTeamTime,
  canManageUsers,
  canRemoveJobAttachments,
  canSeeApiCosts,
  canSeeMarkupAndProfit,
  parseUserRole,
  type UserRole,
} from "@/lib/user-roles";

type UserRoleContextValue = {
  profile: UserProfileRow | null;
  role: UserRole | null;
  loading: boolean;
  refresh: () => Promise<void>;
  canManageUsers: boolean;
  canSeeApiCosts: boolean;
  canSeeMarkupAndProfit: boolean;
  canAccessFinancialTools: boolean;
  canDeleteJobs: boolean;
  canCreateOrEditJobs: boolean;
  canRemoveJobAttachments: boolean;
  canAssignJobs: boolean;
  canManageReferenceDocuments: boolean;
  canManageTeamTime: boolean;
};

const UserRoleContext = createContext<UserRoleContextValue | null>(null);

function parseProfilePayload(j: unknown): UserProfileRow | null {
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : null;
  const email = typeof o.email === "string" ? o.email : null;
  const full_name = typeof o.full_name === "string" ? o.full_name : "";
  const first_name =
    o.first_name == null ? "" : String(o.first_name as string | number);
  const last_name =
    o.last_name == null ? "" : String(o.last_name as string | number);
  const employee_number =
    o.employee_number == null
      ? ""
      : String(o.employee_number as string | number);
  const role = parseUserRole(typeof o.role === "string" ? o.role : null);
  const is_active = typeof o.is_active === "boolean" ? o.is_active : true;
  const show_punch_interface =
    typeof o.show_punch_interface === "boolean"
      ? o.show_punch_interface
      : false;
  const created_at =
    typeof o.created_at === "string" ? o.created_at : new Date().toISOString();
  const updated_at =
    typeof o.updated_at === "string" ? o.updated_at : new Date().toISOString();
  if (!id || !email || !role) return null;
  return {
    id,
    email,
    full_name,
    first_name,
    last_name,
    employee_number,
    role,
    is_active,
    show_punch_interface,
    created_at,
    updated_at,
  };
}

export function UserRoleProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const sb = createBrowserClient();
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session?.user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    try {
      const r = await fetch("/api/user-profile", { credentials: "include" });
      if (r.status === 401) {
        setProfile(null);
        setLoading(false);
        return;
      }
      const j = (await r.json()) as { profile?: unknown; error?: string };
      if (!r.ok || j.error) {
        setProfile(null);
        setLoading(false);
        return;
      }
      const p = parseProfilePayload(j.profile);
      setProfile(p);
      if (p && p.is_active === false) {
        await sb.auth.signOut();
        window.location.href = "/login?inactive=1";
      }
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sb = createBrowserClient();
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event) => {
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "USER_UPDATED" ||
        event === "TOKEN_REFRESHED"
      ) {
        setLoading(true);
        void refresh();
      }
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  const role = profile?.role ?? null;

  const value = useMemo<UserRoleContextValue>(
    () => ({
      profile,
      role,
      loading,
      refresh,
      canManageUsers: !loading && canManageUsers(role),
      canSeeApiCosts: !loading && canSeeApiCosts(role),
      canSeeMarkupAndProfit: !loading && canSeeMarkupAndProfit(role),
      canAccessFinancialTools: !loading && canAccessFinancialTools(role),
      canDeleteJobs: !loading && canDeleteJobs(role),
      canCreateOrEditJobs: !loading && canCreateOrEditJobs(role),
      canRemoveJobAttachments: !loading && canRemoveJobAttachments(role),
      canAssignJobs: !loading && canAssignJobs(role),
      canManageReferenceDocuments:
        !loading && canManageReferenceDocuments(role),
      canManageTeamTime: !loading && canManageTeamTime(role),
    }),
    [profile, role, loading, refresh],
  );

  return (
    <UserRoleContext.Provider value={value}>{children}</UserRoleContext.Provider>
  );
}

export function useUserRoleContext(): UserRoleContextValue {
  const ctx = useContext(UserRoleContext);
  if (!ctx) {
    throw new Error("useUserRole must be used within UserRoleProvider");
  }
  return ctx;
}
