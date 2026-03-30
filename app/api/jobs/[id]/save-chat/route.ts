import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isChatMessageArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (const item of value) {
    if (item == null || typeof item !== "object" || Array.isArray(item)) {
      return false;
    }
    const o = item as Record<string, unknown>;
    if (o.role !== "user" && o.role !== "assistant") return false;
    if (typeof o.content !== "string") return false;
    if (typeof o.timestamp !== "string") return false;
  }
  return true;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: jobId } = await context.params;

  return withAuth(async (req, { user, supabase }) => {
    if (!jobId || !UUID_RE.test(jobId)) {
      return NextResponse.json({ error: "Invalid job id." }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const record =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : null;
    const content = record?.content;
    if (!isChatMessageArray(content)) {
      return NextResponse.json(
        { error: "Body must include content: ChatMessage[]." },
        { status: 400 },
      );
    }

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id")
      .eq("id", jobId)
      .maybeSingle();

    if (jobErr) {
      return NextResponse.json(
        { error: jobErr.message || "Could not verify job." },
        { status: 500 },
      );
    }
    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const { error: insErr } = await supabase.from("job_notes").insert({
      job_id: jobId,
      content,
      type: "ai_chat",
      created_by: user.id,
    });

    if (insErr) {
      return NextResponse.json(
        { error: insErr.message || "Could not save chat." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  })(request);
}
