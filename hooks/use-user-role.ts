"use client";

import { useUserRoleContext } from "@/components/user-role-provider";

/**
 * Current user role and permission flags from `user_profiles`, cached in React context.
 * `profile` includes `first_name`, `last_name`, `employee_number`, and `full_name`.
 */
export function useUserRole() {
  return useUserRoleContext();
}
