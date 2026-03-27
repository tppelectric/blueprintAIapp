import { NextResponse } from "next/server";
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

  console.log("Save data:", JSON.stringify(formData, null, 2));

  let payload: Record<string, unknown>;
  try {
    payload = sanitizeDailyLogInsertPayload(formData);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid payload.";
    console.log("Save error (sanitize):", msg);
    return NextResponse.json({ error: msg, code: "sanitize" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("daily_logs")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    console.log("Save error:", error);
    return NextResponse.json(
      {
        error: error.message,
        details: error.details ?? null,
        hint: error.hint ?? null,
        code: error.code ?? null,
      },
      { status: 400 },
    );
  }

  const id = data?.id as string | undefined;
  if (!id) {
    console.log("Save error: no id returned from insert");
    return NextResponse.json(
      { error: "Insert succeeded but no row id was returned." },
      { status: 500 },
    );
  }

  return NextResponse.json({ id });
}
