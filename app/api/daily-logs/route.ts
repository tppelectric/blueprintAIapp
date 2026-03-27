import { NextResponse } from "next/server";
import { formatDailyLogSaveError } from "@/lib/daily-logs-api-errors";
import { sanitizeDailyLogInsertPayload } from "@/lib/daily-logs-sanitize-insert";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const formData =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  let payload: Record<string, unknown>;
  try {
    payload = sanitizeDailyLogInsertPayload(formData);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid payload.";
    return NextResponse.json({ error: msg, code: "sanitize" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("daily_logs")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    const status = error.code === "42501" ? 403 : 400;
    const friendly = formatDailyLogSaveError({
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      status,
    });
    return NextResponse.json(
      {
        error: friendly,
        details: error.details ?? null,
        hint: error.hint ?? null,
        code: error.code ?? null,
      },
      { status },
    );
  }

  const id = data?.id as string | undefined;
  if (!id) {
    return NextResponse.json(
      {
        error: formatDailyLogSaveError({
          message: "Insert succeeded but no row id was returned.",
          status: 500,
        }),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ id });
}
