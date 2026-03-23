import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId")?.trim();
  if (!projectId || !uuidRe.test(projectId)) {
    return NextResponse.json({ error: "Invalid or missing projectId." }, { status: 400 });
  }

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

  const { data, error } = await supabase
    .from("project_symbols")
    .select("*")
    .eq("project_id", projectId)
    .order("source_page", { ascending: true });

  if (error) {
    console.error(
      "[project-symbols GET] select failed:",
      error.message,
      error.details,
      error.hint,
      error.code,
    );
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ symbols: data ?? [] });
}

export async function PATCH(request: Request) {
  let body: {
    id?: string;
    symbolDescription?: string;
    userConfirmed?: boolean;
    symbolImageBase64?: string | null;
    symbolBbox?: { nx: number; ny: number; nw: number; nh: number } | null;
    capturePage?: number | null;
    captureXPercent?: number | null;
    captureYPercent?: number | null;
    captureWidthPercent?: number | null;
    captureHeightPercent?: number | null;
    matchCount?: number | null;
    verifiedBy?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const id = body.id?.trim();
  if (!id || !uuidRe.test(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.symbolDescription === "string") {
    const t = body.symbolDescription.trim();
    if (!t) {
      return NextResponse.json(
        { error: "symbolDescription cannot be empty." },
        { status: 400 },
      );
    }
    updates.symbol_description = t;
  }
  if (typeof body.userConfirmed === "boolean") {
    updates.user_confirmed = body.userConfirmed;
  }
  if (body.symbolImageBase64 !== undefined) {
    if (body.symbolImageBase64 === null) {
      updates.symbol_image_base64 = null;
    } else if (typeof body.symbolImageBase64 === "string") {
      const s = body.symbolImageBase64.trim();
      updates.symbol_image_base64 = s.length ? s : null;
    }
  }
  if (body.symbolBbox !== undefined) {
    if (body.symbolBbox === null) {
      updates.symbol_bbox = null;
    } else if (body.symbolBbox && typeof body.symbolBbox === "object") {
      const b = body.symbolBbox;
      const nx = Number(b.nx);
      const ny = Number(b.ny);
      const nw = Number(b.nw);
      const nh = Number(b.nh);
      if (
        [nx, ny, nw, nh].every(Number.isFinite) &&
        nw > 0 &&
        nh > 0 &&
        nx >= 0 &&
        ny >= 0 &&
        nx + nw <= 1.001 &&
        ny + nh <= 1.001
      ) {
        updates.symbol_bbox = { nx, ny, nw, nh };
      } else {
        return NextResponse.json({ error: "Invalid symbolBbox." }, { status: 400 });
      }
    }
  }
  if (body.capturePage !== undefined) {
    if (body.capturePage === null) updates.capture_page = null;
    else if (
      typeof body.capturePage === "number" &&
      Number.isInteger(body.capturePage) &&
      body.capturePage >= 1
    ) {
      updates.capture_page = body.capturePage;
    } else {
      return NextResponse.json({ error: "Invalid capturePage." }, { status: 400 });
    }
  }
  const pct = (v: unknown) => {
    if (v === null) return null;
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100) return v;
    return undefined;
  };
  const cx = pct(body.captureXPercent);
  if (body.captureXPercent !== undefined) {
    if (cx === undefined && body.captureXPercent !== null) {
      return NextResponse.json({ error: "Invalid captureXPercent." }, { status: 400 });
    }
    if (cx !== undefined) updates.capture_x_percent = cx;
    if (body.captureXPercent === null) updates.capture_x_percent = null;
  }
  const cy = pct(body.captureYPercent);
  if (body.captureYPercent !== undefined) {
    if (cy === undefined && body.captureYPercent !== null) {
      return NextResponse.json({ error: "Invalid captureYPercent." }, { status: 400 });
    }
    if (cy !== undefined) updates.capture_y_percent = cy;
    if (body.captureYPercent === null) updates.capture_y_percent = null;
  }
  const cw = pct(body.captureWidthPercent);
  if (body.captureWidthPercent !== undefined) {
    if (cw === undefined && body.captureWidthPercent !== null) {
      return NextResponse.json({ error: "Invalid captureWidthPercent." }, { status: 400 });
    }
    if (cw !== undefined) updates.capture_width_percent = cw;
    if (body.captureWidthPercent === null) updates.capture_width_percent = null;
  }
  const ch = pct(body.captureHeightPercent);
  if (body.captureHeightPercent !== undefined) {
    if (ch === undefined && body.captureHeightPercent !== null) {
      return NextResponse.json({ error: "Invalid captureHeightPercent." }, { status: 400 });
    }
    if (ch !== undefined) updates.capture_height_percent = ch;
    if (body.captureHeightPercent === null) updates.capture_height_percent = null;
  }
  if (body.matchCount !== undefined) {
    if (body.matchCount === null) updates.match_count = null;
    else if (
      typeof body.matchCount === "number" &&
      Number.isInteger(body.matchCount) &&
      body.matchCount >= 0
    ) {
      updates.match_count = body.matchCount;
    } else {
      return NextResponse.json({ error: "Invalid matchCount." }, { status: 400 });
    }
  }
  if (body.verifiedBy !== undefined) {
    if (body.verifiedBy === null) updates.verified_by = null;
    else if (typeof body.verifiedBy === "string") {
      const t = body.verifiedBy.trim();
      updates.verified_by = t.length ? t : null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update." },
      { status: 400 },
    );
  }

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

  const { data, error } = await supabase
    .from("project_symbols")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error(
      "[project-symbols PATCH] update failed:",
      error.message,
      error.details,
      error.hint,
      error.code,
    );
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Symbol row not found." }, { status: 404 });
  }

  return NextResponse.json({ symbol: data });
}
