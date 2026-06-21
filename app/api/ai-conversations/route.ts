import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PAGE_CTX_MAX = 120;
const TITLE_MAX = 60;
const INSERT_TITLE_FALLBACK = "Chat";
const JOB_REF_MAX = 120;
const JOB_LABEL_MAX = 200;

function sanitizeJobTag(
  rawId: unknown,
  rawLabel: unknown,
): { id: string | null; label: string | null } | undefined {
  if (rawId === undefined && rawLabel === undefined) return undefined;
  const idRaw = rawId === null || rawId === undefined ? "" : String(rawId).trim();
  if (!idRaw) {
    return { id: null, label: null };
  }
  const id = idRaw.slice(0, JOB_REF_MAX);
  const labelRaw =
    rawLabel === null || rawLabel === undefined ? "" : String(rawLabel).trim();
  const label = labelRaw ? labelRaw.slice(0, JOB_LABEL_MAX) : null;
  return { id, label };
}

type ConversationRow = {
  id: string;
  messages: unknown;
  title: string | null;
  updated_at: string;
  jobtread_job_id?: string | null;
  job_label?: string | null;
};

function conversationJson(rec: ConversationRow, pageContext: string) {
  return {
    ok: true as const,
    pageContext,
    id: rec.id,
    messages: sanitizeMessages(rec.messages),
    title: rec.title,
    updatedAt: rec.updated_at,
    jobtreadJobId: rec.jobtread_job_id ?? null,
    jobLabel: rec.job_label ?? null,
  };
}

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
  jobtreadJobId?: string | null;
  jobLabel?: string | null;
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
    if (typeof o.jobtreadJobId === "string" && o.jobtreadJobId.trim()) {
      row.jobtreadJobId = o.jobtreadJobId;
      row.jobLabel = typeof o.jobLabel === "string" ? o.jobLabel : null;
    }
    out.push(row);
    if (out.length >= 80) break;
  }
  return out;
}

/** First user message, trimmed, max 60 chars; never null (server-only, ignores any client title). */
function deriveInsertTitle(messages: StoredMsg[]): string {
  const first = messages.find((m) => m.role === "user" && m.content.trim());
  if (!first) return INSERT_TITLE_FALLBACK;
  const t = first.content.trim().replace(/\s+/g, " ");
  return t.slice(0, TITLE_MAX);
}

/**
 * GET ?page_context= — load messages for current user + page.
 */
export async function GET(request: NextRequest) {
  const supabase = createSupabaseRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    console.error(
      "[ai-conversations] GET Unauthorized: supabase.auth.getUser() returned no user (session/cookies missing on request?)",
    );
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
    .select("id,messages,title,updated_at,jobtread_job_id,job_label")
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
      jobtreadJobId: null,
      jobLabel: null,
    });
  }

  return NextResponse.json(
    conversationJson(data as ConversationRow, pageContext),
  );
}

/**
 * POST { pageContext, messages } — first save INSERTs (title from first user
 * message, max 60 chars); later saves UPDATE messages + updated_at only.
 */
export async function POST(request: NextRequest) {
  const supabase = createSupabaseRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    console.error(
      "[ai-conversations] POST Unauthorized: supabase.auth.getUser() returned no user (session/cookies missing on request?)",
    );
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: {
    pageContext?: string;
    messages?: unknown;
    jobtreadJobId?: string | null;
    jobLabel?: string | null;
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
  if (messages.length === 0) {
    return NextResponse.json(
      { error: "messages must include at least one valid entry." },
      { status: 400 },
    );
  }

  const jobTag = sanitizeJobTag(body.jobtreadJobId, body.jobLabel);
  const now = new Date().toISOString();

  const { data: existing, error: selectError } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("user_id", user.id)
    .eq("page_context", pageContext)
    .maybeSingle();

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  if (!existing) {
    const title = deriveInsertTitle(messages);
    const insertRow: Record<string, unknown> = {
      user_id: user.id,
      page_context: pageContext,
      messages,
      title,
      updated_at: now,
    };
    if (jobTag) {
      insertRow.jobtread_job_id = jobTag.id;
      insertRow.job_label = jobTag.label;
    }
    const { data: inserted, error: insertError } = await supabase
      .from("ai_conversations")
      .insert(insertRow)
      .select("id")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      id: (inserted as { id: string }).id,
      pageContext,
      created: true,
    });
  }

  const updateRow: Record<string, unknown> = {
    messages,
    updated_at: now,
  };
  if (jobTag) {
    updateRow.jobtread_job_id = jobTag.id;
    updateRow.job_label = jobTag.label;
  }

  const { error: updateError } = await supabase
    .from("ai_conversations")
    .update(updateRow)
    .eq("id", (existing as { id: string }).id)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id: (existing as { id: string }).id,
    pageContext,
    created: false,
  });
}

/**
 * PATCH { pageContext, jobtreadJobId, jobLabel } — tag or clear job without messages.
 */
export async function PATCH(request: NextRequest) {
  const supabase = createSupabaseRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: {
    pageContext?: string;
    jobtreadJobId?: string | null;
    jobLabel?: string | null;
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

  const jobTag = sanitizeJobTag(body.jobtreadJobId, body.jobLabel);
  if (!jobTag) {
    return NextResponse.json({ error: "jobtreadJobId required." }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { data: existing, error: selectError } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("user_id", user.id)
    .eq("page_context", pageContext)
    .maybeSingle();

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  if (!existing) {
    const { data: inserted, error: insertError } = await supabase
      .from("ai_conversations")
      .insert({
        user_id: user.id,
        page_context: pageContext,
        messages: [],
        title: INSERT_TITLE_FALLBACK,
        updated_at: now,
        jobtread_job_id: jobTag.id,
        job_label: jobTag.label,
      })
      .select("id,jobtread_job_id,job_label")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const row = inserted as {
      id: string;
      jobtread_job_id: string | null;
      job_label: string | null;
    };
    return NextResponse.json({
      ok: true,
      id: row.id,
      pageContext,
      jobtreadJobId: row.jobtread_job_id,
      jobLabel: row.job_label,
    });
  }

  const { data: updated, error: updateError } = await supabase
    .from("ai_conversations")
    .update({
      jobtread_job_id: jobTag.id,
      job_label: jobTag.label,
      updated_at: now,
    })
    .eq("id", (existing as { id: string }).id)
    .eq("user_id", user.id)
    .select("id,jobtread_job_id,job_label")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const row = updated as {
    id: string;
    jobtread_job_id: string | null;
    job_label: string | null;
  };
  return NextResponse.json({
    ok: true,
    id: row.id,
    pageContext,
    jobtreadJobId: row.jobtread_job_id,
    jobLabel: row.job_label,
  });
}

/**
 * DELETE ?page_context= — clear stored thread for page.
 */
export async function DELETE(request: NextRequest) {
  const supabase = createSupabaseRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    console.error(
      "[ai-conversations] DELETE Unauthorized: supabase.auth.getUser() returned no user (session/cookies missing on request?)",
    );
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
