import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

/** Returns whether first-admin bootstrap is still allowed (no auth users yet). */
export async function GET() {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });
    if (error) {
      return NextResponse.json(
        { error: error.message, open: false },
        { status: 500 },
      );
    }
    const hasUsers = (data?.users?.length ?? 0) > 0;
    return NextResponse.json({ open: !hasUsers });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Server error",
        open: false,
      },
      { status: 500 },
    );
  }
}
