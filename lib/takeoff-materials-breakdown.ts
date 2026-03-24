import type { ElectricalItemRow } from "@/lib/electrical-item-types";
import {
  defaultProjectBreakdownState,
  ELECTRICAL_MATERIAL_PRESETS,
  newPbId,
  type PBMaterialLine,
  type ProjectBreakdownState,
} from "@/lib/project-breakdown";
import { exportEffectiveQty } from "@/lib/scan-export";
function guessPresetUnitCost(item: ElectricalItemRow): {
  equipOptionId: string;
  unitCost: number;
  unit: string;
} {
  const blob = `${item.description} ${item.specification ?? ""}`.toLowerCase();
  const u = (item.unit || "EA").toUpperCase();
  if (item.category === "plan_note") {
    const p = ELECTRICAL_MATERIAL_PRESETS.find((x) => x.id === "custom")!;
    return { equipOptionId: "custom", unitCost: p.defaultUnitCost, unit: u };
  }
  if (/\bgfci\b/i.test(blob)) {
    const p = ELECTRICAL_MATERIAL_PRESETS.find((x) => x.id === "gfci15")!;
    return { equipOptionId: "gfci15", unitCost: p.defaultUnitCost, unit: "EA" };
  }
  if (/\b20a\b|\b20\s*a\b/i.test(blob) && /recept|outlet/i.test(blob)) {
    const p = ELECTRICAL_MATERIAL_PRESETS.find((x) => x.id === "dup20")!;
    return { equipOptionId: "dup20", unitCost: p.defaultUnitCost, unit: "EA" };
  }
  if (/recept|outlet|duplex/i.test(blob)) {
    const p = ELECTRICAL_MATERIAL_PRESETS.find((x) => x.id === "dup15")!;
    return { equipOptionId: "dup15", unitCost: p.defaultUnitCost, unit: "EA" };
  }
  if (/dimmer/i.test(blob)) {
    const p = ELECTRICAL_MATERIAL_PRESETS.find((x) => x.id === "dim")!;
    return { equipOptionId: "dim", unitCost: p.defaultUnitCost, unit: "EA" };
  }
  if (/3-?way|three-?way/i.test(blob)) {
    const p = ELECTRICAL_MATERIAL_PRESETS.find((x) => x.id === "sw3")!;
    return { equipOptionId: "sw3", unitCost: p.defaultUnitCost, unit: "EA" };
  }
  if (/switch/i.test(blob)) {
    const p = ELECTRICAL_MATERIAL_PRESETS.find((x) => x.id === "sw1")!;
    return { equipOptionId: "sw1", unitCost: p.defaultUnitCost, unit: "EA" };
  }
  if (/recess|can light|led down/i.test(blob)) {
    const p = ELECTRICAL_MATERIAL_PRESETS.find((x) => x.id === "canLed")!;
    return { equipOptionId: "canLed", unitCost: p.defaultUnitCost, unit: "EA" };
  }
  if (/fan/i.test(blob) && /ceiling/i.test(blob)) {
    const p = ELECTRICAL_MATERIAL_PRESETS.find((x) => x.id === "surfFx")!;
    return { equipOptionId: "surfFx", unitCost: p.defaultUnitCost, unit: "EA" };
  }
  if (item.category === "panel" || /panel|breaker|disconnect/i.test(blob)) {
    const p = ELECTRICAL_MATERIAL_PRESETS.find((x) => x.id === "br20")!;
    return { equipOptionId: "br20", unitCost: p.defaultUnitCost, unit: "EA" };
  }
  if (item.category === "wiring" || /\bwire|cable|nm\b/i.test(blob)) {
    const p = ELECTRICAL_MATERIAL_PRESETS.find((x) => x.id === "nm122")!;
    return { equipOptionId: "nm122", unitCost: p.defaultUnitCost, unit: "LF" };
  }
  const p = ELECTRICAL_MATERIAL_PRESETS.find((x) => x.id === "custom")!;
  return { equipOptionId: "custom", unitCost: p.defaultUnitCost, unit: u };
}

function lineKey(item: ElectricalItemRow): string {
  const spec = (item.specification ?? "").trim();
  return [
    item.category,
    item.description.trim(),
    spec,
    (item.unit || "EA").toUpperCase(),
  ].join("\u0001");
}

/** Group takeoff items into project breakdown material lines (excludes empty plan notes). */
export function buildProjectBreakdownFromTakeoffItems(
  items: ElectricalItemRow[],
  manualCounts: Record<string, number>,
  manualMode: boolean,
  projectLabel: string,
): { state: ProjectBreakdownState; lineCount: number } {
  const base = defaultProjectBreakdownState();
  const map = new Map<string, { qty: number; sample: ElectricalItemRow }>();

  for (const item of items) {
    if (item.category === "plan_note") continue;
    const k = lineKey(item);
    const q = exportEffectiveQty(item, manualCounts, manualMode);
    const prev = map.get(k);
    if (prev) prev.qty += q;
    else map.set(k, { qty: q, sample: item });
  }

  const materials: PBMaterialLine[] = [];
  for (const { qty, sample } of map.values()) {
    const { equipOptionId, unitCost, unit } = guessPresetUnitCost(sample);
    const desc = [sample.description.trim(), sample.specification?.trim()]
      .filter(Boolean)
      .join(" — ");
    materials.push({
      id: newPbId(),
      description: desc || sample.description,
      qty,
      unit,
      unitCost,
      markupPct: null,
      bomSlot: null,
      equipOptionId,
    });
  }

  materials.sort((a, b) => a.description.localeCompare(b.description));

  return {
    state: {
      ...base,
      notes: `Materials generated from blueprint takeoff: ${projectLabel}. Review quantities and preset costs.`,
      materials,
    },
    lineCount: materials.length,
  };
}
