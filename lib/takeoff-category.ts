import type { ElectricalItemRow } from "@/lib/electrical-item-types";

/** UI filter tabs aligned with takeoff summary rows */
export type TakeoffFilterTab =
  | "all"
  | "fixtures"
  | "receptacles"
  | "switches"
  | "panels"
  | "plan_notes"
  | "low_voltage"
  | "wiring";

const RECEPT = /\b(recept|outlet|duplex|gfci|g\.?f\.?c\.?i|dedicated|laundry|washer|dryer)\b/i;
const SWITCH = /\b(switch|dimmer|3-?way|three-?way|occupancy|motion\s*sensor)\b/i;
const LOWV = /\b(tv|data|cat\s*6|cat6|ethernet|rj45|speaker|hdmi|coax|low\s*volt|comm|telecom|usb)\b/i;
const FIXTURE = /\b(light|fixture|lamp|can\s*light|recessed|sconce|fan|chandelier|led)\b/i;

export function inferTakeoffBucket(item: ElectricalItemRow): TakeoffFilterTab {
  const cat = (item.category ?? "").toLowerCase();
  if (cat === "plan_note") return "plan_notes";
  if (cat === "panel") return "panels";
  if (cat === "wiring") return "wiring";
  const blob = `${item.description} ${item.specification ?? ""}`.toLowerCase();
  if (RECEPT.test(blob)) return "receptacles";
  if (SWITCH.test(blob)) return "switches";
  if (LOWV.test(blob)) return "low_voltage";
  if (cat === "fixture" || FIXTURE.test(blob)) return "fixtures";
  return "fixtures";
}

export function itemMatchesTakeoffTab(
  item: ElectricalItemRow,
  tab: TakeoffFilterTab,
): boolean {
  if (tab === "all") return true;
  if (tab === "plan_notes") return item.category === "plan_note";
  return item.category !== "plan_note" && inferTakeoffBucket(item) === tab;
}

export const TAKEOFF_TAB_META: {
  id: TakeoffFilterTab;
  label: string;
  summaryDetail: string;
}[] = [
  { id: "all", label: "All", summaryDetail: "" },
  {
    id: "fixtures",
    label: "Fixtures",
    summaryDetail: "Recessed, fans, sconces",
  },
  {
    id: "receptacles",
    label: "Receptacles",
    summaryDetail: "Standard, GFCI, dedicated",
  },
  {
    id: "switches",
    label: "Switches",
    summaryDetail: "Single pole, 3-way, dimmer",
  },
  { id: "panels", label: "Panels", summaryDetail: "Breakers, panels" },
  {
    id: "plan_notes",
    label: "Plan Notes",
    summaryDetail: "Code notes, specs",
  },
  {
    id: "low_voltage",
    label: "Low Voltage",
    summaryDetail: "TV, data, speakers",
  },
  { id: "wiring", label: "Wiring", summaryDetail: "Homeruns, feeders" },
];

export type TakeoffCategoryExportScope =
  | "all"
  | "fixtures"
  | "receptacles"
  | "switches"
  | "panels"
  | "plan_notes"
  | "low_voltage"
  | "wiring";

export function filterItemsByExportScopes(
  items: ElectricalItemRow[],
  scopes: TakeoffCategoryExportScope[],
): ElectricalItemRow[] {
  if (!scopes.length || scopes.includes("all")) return items;
  const set = new Set(scopes);
  return items.filter((i) => {
    for (const s of set) {
      if (s === "plan_notes" && i.category === "plan_note") return true;
      if (s !== "plan_notes" && itemMatchesTakeoffTab(i, s as TakeoffFilterTab))
        return true;
    }
    return false;
  });
}
