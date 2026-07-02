import { NextResponse, type NextRequest } from "next/server";
import { requireCompanyAdmin } from "@/lib/require-company-admin";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { buildTimecardPdf } from "@/lib/timecard-pdf";
import type { TimesheetRow } from "@/lib/time-management-types";

export const dynamic = "force-dynamic";

/**
 * Payroll time cards PDF for a date range (admin / super_admin only).
 * GET /api/timesheets/timecards/pdf?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export async function GET(request: NextRequest) {
  const auth = await requireCompanyAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from")?.trim();
  const to = url.searchParams.get("to")?.trim();
  if (!from || !to) {
    return NextResponse.json(
      { error: "from and to (YYYY-MM-DD) are required." },
      { status: 400 },
    );
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error." },
      { status: 500 },
    );
  }

  const { data, error } = await admin
    .from("timesheets")
    .select("*")
    .gte("log_date", from)
    .lte("log_date", to)
    .order("employee_name", { ascending: true })
    .order("log_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as TimesheetRow[];
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No timesheet rows in that range." },
      { status: 404 },
    );
  }

  const pdf = buildTimecardPdf(rows, { from, to });
  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="timecards-${from}_${to}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
