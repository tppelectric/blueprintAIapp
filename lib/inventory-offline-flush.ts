import type { SupabaseClient } from "@supabase/supabase-js";
import {
  peekOfflineQueue,
  removeQueued,
} from "@/lib/inventory-offline-queue";
import { insertInventoryTransaction } from "@/lib/inventory-tx";

export async function flushInventoryOfflineQueue(
  sb: SupabaseClient,
  ctx: { userId: string; employeeName: string },
): Promise<number> {
  const items = peekOfflineQueue();
  let processed = 0;
  for (const item of items) {
    try {
      if (item.op.kind === "asset_checkout") {
        const { error } = await sb
          .from("assets")
          .update({
            status: "checked_out",
            assigned_to: ctx.userId,
            assigned_to_name: ctx.employeeName,
          })
          .eq("id", item.op.assetId);
        if (error) throw error;
        await insertInventoryTransaction(sb, {
          asset_id: item.op.assetId,
          employee_id: ctx.userId,
          employee_name: ctx.employeeName,
          transaction_type: "checkout",
          from_location_id: item.op.fromLocationId,
        });
      } else if (item.op.kind === "asset_checkin") {
        const { error } = await sb
          .from("assets")
          .update({
            status: "available",
            assigned_to: null,
            assigned_to_name: null,
            location_id: item.op.locationId,
          })
          .eq("id", item.op.assetId);
        if (error) throw error;
        await insertInventoryTransaction(sb, {
          asset_id: item.op.assetId,
          employee_id: ctx.userId,
          employee_name: ctx.employeeName,
          transaction_type: "checkin",
          to_location_id: item.op.locationId,
        });
      }
      removeQueued(item.id);
      processed += 1;
    } catch {
      break;
    }
  }
  return processed;
}
