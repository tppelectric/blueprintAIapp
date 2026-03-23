import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MatchDotIn = { nx?: number; ny?: number; n?: number; room?: string | null };

function normalizeDots(raw: unknown): {
  dots: { nx: number; ny: number; n: number; room: string | null }[];
} | { error: string } {
  if (!Array.isArray(raw)) return { error: "dots must be an array." };
  const out: { nx: number; ny: number; n: number; room: string | null }[] = [];
  let i = 0;
  for (const d of raw) {
    i++;
    if (!d || typeof d !== "object") return { error: `Invalid dot at index ${i}.` };
    const o = d as MatchDotIn;
    const nx = Number(o.nx);
    const ny = Number(o.ny);
    const n = Math.round(Number(o.n));
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isInteger(n) || n < 1) {
      return { error: `Invalid dot coordinates or index at ${i}.` };
    }
    const room =
      typeof o.room === "string" && o.room.trim() ? o.room.trim() : null;
    out.push({ nx, ny, n, room });
  }
  out.sort((a, b) => a.n - b.n);
  return { dots: out.map((d, idx) => ({ ...d, n: idx + 1 })) };
}

async function distributeDescriptionCount(
  supabase: ReturnType<typeof createServiceRoleClient>,
  projectId: string,
  pageNumber: number,
  description: string,
  totalClicks: number,
): Promise<{ error?: string }> {
  if (totalClicks <= 0) return {};
  const { data: rows, error: fetchErr } = await supabase
    .from("electrical_items")
    .select("id, quantity")
    .eq("project_id", projectId)
    .eq("page_number", pageNumber)
    .eq("description", description)
    .order("id", { ascending: true });

  if (fetchErr) return { error: fetchErr.message };
  if (!rows?.length) return {};

  const sumQ = rows.reduce((s, r) => s + Math.max(0, Number(r.quantity)), 0);
  const bases =
    sumQ > 0
      ? rows.map((r) =>
          Math.floor((totalClicks * Math.max(0, Number(r.quantity))) / sumQ),
        )
      : rows.map(() => 0);
  let remainder = totalClicks - bases.reduce((a, b) => a + b, 0);
  for (let j = 0; remainder > 0 && j < bases.length; j++) {
    bases[j]!++;
    remainder--;
  }

  for (let j = 0; j < rows.length; j++) {
    const final_count = bases[j] ?? 0;
    const { error } = await supabase
      .from("electrical_items")
      .update({
        final_count,
        verification_status: "manual",
        verified_by: "symbol_match",
      })
      .eq("id", rows[j]!.id)
      .eq("project_id", projectId)
      .eq("page_number", pageNumber);

    if (error) return { error: error.message };
  }
  return {};
}

export async function POST(request: Request) {
  let body: {
    projectId?: string;
    projectSymbolId?: string;
    symbolDescription?: string;
    pageNumber?: number;
    dots?: unknown[];
    roomScope?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  const projectSymbolId = body.projectSymbolId?.trim();
  const symbolDescription = body.symbolDescription?.trim();
  const pageNumber = body.pageNumber;
  const roomScope =
    typeof body.roomScope === "string" && body.roomScope.trim()
      ? body.roomScope.trim()
      : body.roomScope === "multiple"
        ? "multiple"
        : null;

  if (!projectId || !uuidRe.test(projectId)) {
    return NextResponse.json({ error: "Invalid projectId." }, { status: 400 });
  }
  if (!projectSymbolId || !uuidRe.test(projectSymbolId)) {
    return NextResponse.json({ error: "Invalid projectSymbolId." }, { status: 400 });
  }
  if (!symbolDescription) {
    return NextResponse.json({ error: "symbolDescription is required." }, { status: 400 });
  }
  if (
    typeof pageNumber !== "number" ||
    !Number.isInteger(pageNumber) ||
    pageNumber < 1
  ) {
    return NextResponse.json({ error: "Invalid pageNumber." }, { status: 400 });
  }

  const norm = normalizeDots(body.dots ?? []);
  if ("error" in norm) {
    return NextResponse.json({ error: norm.error }, { status: 400 });
  }
  const { dots } = norm;

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Supabase service client is not configured.",
      },
      { status: 500 },
    );
  }

  const { data: sym, error: symErr } = await supabase
    .from("project_symbols")
    .select("id, project_id, symbol_description")
    .eq("id", projectSymbolId)
    .maybeSingle();

  if (symErr) {
    return NextResponse.json({ error: symErr.message }, { status: 500 });
  }
  if (!sym || sym.project_id !== projectId) {
    return NextResponse.json({ error: "Symbol not found for this project." }, { status: 404 });
  }
  if (sym.symbol_description !== symbolDescription) {
    return NextResponse.json(
      { error: "symbolDescription does not match stored legend row." },
      { status: 400 },
    );
  }

  const match_count = dots.length;

  const { error: upErr } = await supabase.from("symbol_page_matches").upsert(
    {
      project_id: projectId,
      project_symbol_id: projectSymbolId,
      page_number: pageNumber,
      dots,
      match_count,
      room_scope: roomScope,
      verified_by: "symbol_match",
    },
    { onConflict: "project_symbol_id,page_number" },
  );

  if (upErr) {
    console.error("[symbol-match-save] upsert:", upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: agg, error: aggErr } = await supabase
    .from("symbol_page_matches")
    .select("match_count")
    .eq("project_symbol_id", projectSymbolId);

  if (aggErr) {
    return NextResponse.json({ error: aggErr.message }, { status: 500 });
  }
  const totalMatch = (agg ?? []).reduce((s, r) => s + Math.max(0, Number(r.match_count)), 0);

  const { data: updatedSym, error: symUpErr } = await supabase
    .from("project_symbols")
    .update({ match_count: totalMatch })
    .eq("id", projectSymbolId)
    .select()
    .maybeSingle();

  if (symUpErr) {
    return NextResponse.json({ error: symUpErr.message }, { status: 500 });
  }

  const takeoffErr = await distributeDescriptionCount(
    supabase,
    projectId,
    pageNumber,
    symbolDescription,
    match_count,
  );
  if (takeoffErr.error) {
    return NextResponse.json({ error: takeoffErr.error }, { status: 500 });
  }

  const { data: items } = await supabase
    .from("electrical_items")
    .select("*")
    .eq("project_id", projectId)
    .eq("page_number", pageNumber)
    .eq("description", symbolDescription);

  return NextResponse.json({
    symbol: updatedSym,
    pageMatchCount: match_count,
    totalMatchCount: totalMatch,
    items: items ?? [],
  });
}
