import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  humanVerifyPatch,
  normalizeElectricalItemRow,
} from "@/lib/electrical-verify";
import type { SymbolVerifiedStatus } from "@/lib/electrical-item-types";

const STATUSES = new Set<SymbolVerifiedStatus>([
  "unverified",
  "accepted",
  "edited",
  "removed",
  "manual",
]);

/** Update human symbol verify status on a line item (row or single instance). */
export const POST = withAuth(async (request: NextRequest, { user }) => {
  let body: {
    itemId?: string;
    verified_status?: string;
    instanceIndex?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const itemId = body.itemId?.trim();
  const verified_status = body.verified_status?.trim() as
    | SymbolVerifiedStatus
    | undefined;
  if (!itemId) {
    return NextResponse.json({ error: "itemId required." }, { status: 400 });
  }
  if (!verified_status || !STATUSES.has(verified_status)) {
    return NextResponse.json(
      {
        error:
          "verified_status must be unverified|accepted|edited|removed|manual.",
      },
      { status: 400 },
    );
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

  const { data: row, error: fetchErr } = await supabase
    .from("electrical_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const normalized = normalizeElectricalItemRow(row as Record<string, unknown>);
  const patch = humanVerifyPatch(user.id, verified_status, {
    stampInstances: normalized.instance_locations,
  });

  if (
    typeof body.instanceIndex === "number" &&
    Number.isInteger(body.instanceIndex) &&
    body.instanceIndex >= 0
  ) {
    const instances = normalized.instance_locations ?? [];
    if (body.instanceIndex >= instances.length) {
      return NextResponse.json(
        { error: "instanceIndex out of range." },
        { status: 400 },
      );
    }
    const next = instances.map((p, i) =>
      i === body.instanceIndex
        ? {
            ...p,
            verified_status,
            source: normalized.origin_source ?? "ai",
          }
        : p,
    );
    patch.instance_locations = next;
  }

  const { data, error } = await supabase
    .from("electrical_items")
    .update(patch)
    .eq("id", itemId)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    item: data
      ? normalizeElectricalItemRow(data as Record<string, unknown>)
      : null,
  });
});
