"use client";

import { useUserRoleContext } from "@/components/user-role-provider";

/**
 * Current user role and permission flags from `user_profiles`, cached in React context.
 */
export function useUserRole() {
  return useUserRoleContext();
}
