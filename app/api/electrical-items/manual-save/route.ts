import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  let body: {
    projectId?: string;
    pageNumber?: number;
    counts?: Record<string, number>;
    byId?: { id: string; final_count: number }[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  const pageNumber = body.pageNumber;
  const counts = body.counts;
  const byId = body.byId;

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!projectId || !uuidRe.test(projectId)) {
    return NextResponse.json({ error: "Invalid projectId." }, { status: 400 });
  }
  if (
    typeof pageNumber !== "number" ||
    !Number.isInteger(pageNumber) ||
    pageNumber < 1
  ) {
    return NextResponse.json({ error: "Invalid pageNumber." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Supabase not configured." },
      { status: 500 },
    );
  }

  if (Array.isArray(byId) && byId.length > 0) {
    const updated: unknown[] = [];
    for (const row of byId) {
      const id = typeof row.id === "string" ? row.id.trim() : "";
      if (!id || !uuidRe.test(id)) {
        return NextResponse.json({ error: "Invalid item id in byId." }, { status: 400 });
      }
      const fc = Math.max(0, Math.round(Number(row.final_count)));
      const { data, error } = await supabase
        .from("electrical_items")
        .update({
          final_count: fc,
          verification_status: "manual",
          verified_by: "manual",
        })
        .eq("id", id)
        .eq("project_id", projectId)
        .eq("page_number", pageNumber)
        .select()
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message, id }, { status: 500 });
      }
      if (data) updated.push(data);
    }
    return NextResponse.json({ items: updated });
  }

  if (!counts || typeof counts !== "object") {
    return NextResponse.json(
      { error: "Provide byId array or legacy counts object." },
      { status: 400 },
    );
  }

  const updated: unknown[] = [];
  for (const [description, raw] of Object.entries(counts)) {
    const totalClicks = Math.max(0, Math.round(Number(raw)));
    const { data: rows, error: fetchErr } = await supabase
      .from("electrical_items")
      .select("id, quantity")
      .eq("project_id", projectId)
      .eq("page_number", pageNumber)
      .eq("description", description)
      .order("id", { ascending: true });

    if (fetchErr) {
      return NextResponse.json(
        { error: fetchErr.message, description },
        { status: 500 },
      );
    }
    if (!rows?.length) continue;

    const sumQ = rows.reduce((s, r) => s + Math.max(0, Number(r.quantity)), 0);
    const bases =
      sumQ > 0
        ? rows.map((r) =>
            Math.floor((totalClicks * Math.max(0, Number(r.quantity))) / sumQ),
          )
        : rows.map(() => 0);
    let remainder = totalClicks - bases.reduce((a, b) => a + b, 0);
    for (let i = 0; remainder > 0 && i < bases.length; i++) {
      bases[i]!++;
      remainder--;
    }

    for (let i = 0; i < rows.length; i++) {
      const final_count = bases[i] ?? 0;
      const { data, error } = await supabase
        .from("electrical_items")
        .update({
          final_count,
          verification_status: "manual",
          verified_by: "manual",
        })
        .eq("id", rows[i]!.id)
        .select()
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message, description }, { status: 500 });
      }
      if (data) updated.push(data);
    }
  }

  return NextResponse.json({ items: updated });
}
