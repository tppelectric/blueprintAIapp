import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

function isAdmin(role: string | null) {
  return role === "super_admin" || role === "admin";
}

async function getRole(supabase: ReturnType<typeof createSupabaseRouteClient>, userId: string) {
  const { data } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return (data as { role?: string } | null)?.role ?? null;
}

// GET — list all recipients
export async function GET(request: NextRequest) {
  const supabase = createSupabaseRouteClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getRole(supabase, user.id);
  if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("digest_recipients")
    .select("id, email, is_active, created_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, recipients: data ?? [] });
}

// POST — add a recipient
export async function POST(request: NextRequest) {
  const supabase = createSupabaseRouteClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getRole(supabase, user.id);
  if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { email?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("digest_recipients")
    .insert({ email })
    .select("id, email, is_active, created_at")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, recipient: data });
}

// DELETE — remove a recipient by id
export async function DELETE(request: NextRequest) {
  const supabase = createSupabaseRouteClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getRole(supabase, user.id);
  if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const service = createServiceRoleClient();
  const { error } = await service
    .from("digest_recipients")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
