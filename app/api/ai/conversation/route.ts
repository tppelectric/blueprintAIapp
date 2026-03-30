import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PAGE_CTX_MAX = 120;

function sanitizePageContext(raw: string): string | null {
  const t = raw.trim().slice(0, PAGE_CTX_MAX);
  if (!t) return null;
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(t)) return null;
  return t;
}

type StoredMsg = {
  role: string;
  content: string;
  timestamp: string;
  actions?: unknown;
};

function sanitizeMessages(input: unknown): StoredMsg[] {
  if (!Array.isArray(input)) return [];
  const out: StoredMsg[] = [];
  for (const m of input) {
    if (!m || typeof m !== "object") continue;
    const o = m as Record<string, unknown>;
    const role = o.role === "user" || o.role === "assistant" ? o.role : null;
    const content = typeof o.content === "string" ? o.content : "";
    const timestamp =
      typeof o.timestamp === "string" ? o.timestamp : new Date().toISOString();
    if (!role || !content.trim()) continue;
    const row: StoredMsg = { role, content, timestamp };
    if (Array.isArray(o.actions) && o.actions.length) {
      row.actions = o.actions;
    }
    out.push(row);
    if (out.length >= 80) break;
  }
  return out;
}

/**
 * GET ?page_context= — load messages for current user + page.
 */
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const pageContext = sanitizePageContext(
    url.searchParams.get("page_context") ?? "",
  );
  if (!pageContext) {
    return NextResponse.json(
      { error: "page_context query parameter is required." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("ai_conversations")
    .select("id,messages,title,updated_at")
    .eq("user_id", user.id)
    .eq("page_context", pageContext)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({
      ok: true,
      pageContext,
      messages: [],
      title: null,
      updatedAt: null,
    });
  }

  const rec = data as {
    id: string;
    messages: unknown;
    title: string | null;
    updated_at: string;
  };

  return NextResponse.json({
    ok: true,
    pageContext,
    id: rec.id,
    messages: sanitizeMessages(rec.messages),
    title: rec.title,
    updatedAt: rec.updated_at,
  });
}

/**
 * POST { pageContext, messages, title? } — upsert conversation.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: {
    pageContext?: string;
    messages?: unknown;
    title?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const pageContext = sanitizePageContext(String(body.pageContext ?? ""));
  if (!pageContext) {
    return NextResponse.json(
      { error: "pageContext is required." },
      { status: 400 },
    );
  }

  const messages = sanitizeMessages(body.messages);
  const title =
    typeof body.title === "string"
      ? body.title.trim().slice(0, 200) || null
      : null;

  const now = new Date().toISOString();

  const { data: upserted, error } = await supabase
    .from("ai_conversations")
    .upsert(
      {
        user_id: user.id,
        page_context: pageContext,
        messages,
        title,
        updated_at: now,
      },
      { onConflict: "user_id,page_context" },
    )
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id: (upserted as { id?: string } | null)?.id ?? null,
    pageContext,
  });
}

/**
 * DELETE ?page_context= — clear stored thread for page.
 */
export async function DELETE(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const pageContext = sanitizePageContext(
    url.searchParams.get("page_context") ?? "",
  );
  if (!pageContext) {
    return NextResponse.json(
      { error: "page_context query parameter is required." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("ai_conversations")
    .delete()
    .eq("user_id", user.id)
    .eq("page_context", pageContext);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pageContext });
}
