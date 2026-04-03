import type { UserRole } from "@/lib/user-roles";

export type UserProfileRow = {
  id: string;
  email: string;
  full_name: string;
  first_name: string;
  last_name: string;
  employee_number: string;
  role: UserRole;
  is_active: boolean;
  /** When true, user may punch in/out on /field (any role). */
  show_punch_interface: boolean;
  created_at: string;
  updated_at: string;
};

/** Super-admin user list: profile + auth last sign-in. */
export type AdminUserProfileRow = UserProfileRow & {
  last_sign_in_at: string | null;
  /** From admin users API; may edit own time entries when true. */
  can_edit_timeclock?: boolean;
};
