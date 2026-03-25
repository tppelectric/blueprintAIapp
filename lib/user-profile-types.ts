import type { UserRole } from "@/lib/user-roles";

export type UserProfileRow = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** Super-admin user list: profile + auth last sign-in. */
export type AdminUserProfileRow = UserProfileRow & {
  last_sign_in_at: string | null;
};
