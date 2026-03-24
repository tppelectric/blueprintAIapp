import type { VendorChoice } from "@/lib/wifi-analyzer-engine";
import type { PBEquipSlot } from "@/lib/wifi-project-cost";

export type EquipPickOption = { id: string; label: string; unitPrice: number };

const UBI_IN: EquipPickOption[] = [
  { id: "u6-lite", label: "U6 Lite", unitPrice: 99 },
  { id: "u6-pro", label: "U6 Pro", unitPrice: 179 },
  { id: "u6-ent", label: "U6 Enterprise", unitPrice: 299 },
  { id: "u7-pro", label: "U7 Pro", unitPrice: 219 },
];

const UBI_OUT: EquipPickOption[] = [
  { id: "u6-mesh-out", label: "U6 Mesh outdoor", unitPrice: 179 },
];

const RUCK_IN: EquipPickOption[] = [
  { id: "r350", label: "R350", unitPrice: 299 },
  { id: "r370", label: "R370", unitPrice: 399 },
  { id: "r670", label: "R670", unitPrice: 599 },
];

const RUCK_OUT: EquipPickOption[] = [
  { id: "t350", label: "T350 outdoor", unitPrice: 499 },
];

const TP_IN: EquipPickOption[] = [
  { id: "eap670", label: "EAP670", unitPrice: 89 },
  { id: "eap773", label: "EAP773", unitPrice: 129 },
];

const ACCESS_IN: EquipPickOption[] = [
  { id: "an500", label: "AN-500-AC", unitPrice: 349 },
  { id: "an700", label: "AN-700-AC", unitPrice: 499 },
];

const ARAK_IN: EquipPickOption[] = [
  { id: "an510", label: "AN-510-AP-I-AC", unitPrice: 199 },
  { id: "an810", label: "AN-810-AP-I-AC", unitPrice: 299 },
];

const UBI_SW: EquipPickOption[] = [
  { id: "usw-lite8", label: "USW Lite 8 PoE", unitPrice: 109 },
  { id: "usw-pro16", label: "USW Pro 16 PoE", unitPrice: 299 },
  { id: "usw-pro24", label: "USW Pro 24 PoE", unitPrice: 499 },
];

const TP_SW: EquipPickOption[] = [
  { id: "tl2008", label: "TL-SG2008P", unitPrice: 79 },
  { id: "tl2016", label: "TL-SG2016P", unitPrice: 149 },
];

/** Dropdown options for Wi‑Fi–seeded material lines (null = no picker). */
export function equipmentOptionsForSlot(
  slot: PBEquipSlot,
  vendor: VendorChoice | null | undefined,
): EquipPickOption[] | null {
  if (!vendor || vendor === "none") return null;

  if (slot === "indoor-ap") {
    if (vendor === "ubiquiti") return UBI_IN;
    if (vendor === "ruckus") return RUCK_IN;
    if (vendor === "tp_link") return TP_IN;
    if (vendor === "access_networks") return ACCESS_IN;
    if (vendor === "araknis") return ARAK_IN;
    return null;
  }

  if (slot === "outdoor-ap") {
    if (vendor === "ubiquiti") return UBI_OUT;
    if (vendor === "ruckus") return RUCK_OUT;
    if (vendor === "tp_link")
      return [{ id: "tp-out", label: "Omada outdoor AP (est.)", unitPrice: 120 }];
    if (vendor === "access_networks")
      return [{ id: "an-out", label: "Outdoor AP (est.)", unitPrice: 449 }];
    if (vendor === "araknis")
      return [{ id: "arak-out", label: "Outdoor AP (est.)", unitPrice: 349 }];
    return null;
  }

  if (slot === "poe-switch") {
    if (vendor === "ubiquiti") return UBI_SW;
    if (vendor === "tp_link") return TP_SW;
    return null;
  }

  return null;
}

export function defaultEquipOptionId(
  slot: PBEquipSlot,
  vendor: VendorChoice | null | undefined,
  unitPrice: number,
): string | null {
  const opts = equipmentOptionsForSlot(slot, vendor);
  if (!opts?.length) return null;
  const near = opts.reduce((best, o) =>
    Math.abs(o.unitPrice - unitPrice) < Math.abs(best.unitPrice - unitPrice)
      ? o
      : best,
  );
  return near.id;
}
