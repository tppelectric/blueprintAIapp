import type { ElectricalItemRow } from "@/lib/electrical-item-types";

export type ManualDotStyle = {
  /** If true, blueprint clicks do not place dots for this item */
  skipDot: boolean;
  fill: string;
  letter: string;
};

function d(s: string): string {
  return s.toLowerCase();
}

/**
 * Legacy colors and letter for manual-count dots by item description / category.
 */
export function getManualDotStyle(item: Pick<
  ElectricalItemRow,
  "description" | "category"
>): ManualDotStyle {
  const cat = d(item.category);
  const desc = d(item.description);

  if (cat === "plan_note") {
    return { skipDot: true, fill: "#ffffff", letter: "?" };
  }

  if (cat === "wiring") {
    return { skipDot: false, fill: "#6b7280", letter: "W" };
  }

  if (cat === "panel") {
    return { skipDot: false, fill: "#c2410c", letter: "P" };
  }

  if (desc.includes("recessed") && desc.includes("light")) {
    return { skipDot: false, fill: "#eab308", letter: "L" };
  }
  if (desc.includes("surface") && desc.includes("light")) {
    return { skipDot: false, fill: "#f97316", letter: "L" };
  }
  if (desc.includes("duplex") && desc.includes("recept")) {
    return { skipDot: false, fill: "#2563eb", letter: "R" };
  }
  if (desc.includes("gfci") || desc.includes("gfi")) {
    return { skipDot: false, fill: "#16a34a", letter: "G" };
  }
  if (desc.includes("dimmer")) {
    return { skipDot: false, fill: "#ec4899", letter: "D" };
  }
  if (desc.includes("switch")) {
    return { skipDot: false, fill: "#9333ea", letter: "S" };
  }
  if (desc.includes("smoke")) {
    return { skipDot: false, fill: "#dc2626", letter: "S" };
  }
  if (desc.includes("carbon monoxide")) {
    return { skipDot: false, fill: "#7f1d1d", letter: "C" };
  }
  if (desc.includes("dedicated") && desc.includes("circuit")) {
    return { skipDot: false, fill: "#0d9488", letter: "C" };
  }
  if (
    (desc.includes("ev") && desc.includes("charg")) ||
    desc.includes("electric vehicle")
  ) {
    return { skipDot: false, fill: "#38bdf8", letter: "E" };
  }

  if (cat === "fixture") {
    const w = item.description.trim();
    const letter = w ? w[0]!.toUpperCase() : "F";
    return { skipDot: false, fill: "#f8fafc", letter };
  }

  const w = item.description.trim();
  const letter = w ? w[0]!.toUpperCase() : "?";
  return { skipDot: false, fill: "#94a3b8", letter };
}

export type ManualDotAppearance = {
  skipDot: boolean;
  /** HSL or hex fill for dot body */
  fill: string;
  /** Secondary line color for ring / X */
  stroke: string;
  /** Primary glyph: · R × S P ? … */
  glyph: string;
  /** filled = solid circle; ring = hollow; ring_x = hollow with X */
  variant: "filled" | "ring" | "ring_x";
};

const ROOM_HUES = [217, 145, 32, 277, 195, 328];

function roomHue(roomIndex: number): number {
  return ROOM_HUES[((roomIndex % ROOM_HUES.length) + ROOM_HUES.length) % ROOM_HUES.length]!;
}

export type ManualItemKind =
  | "receptacle"
  | "light"
  | "switch"
  | "panel"
  | "other";

const KIND_PLURAL: Record<ManualItemKind, string> = {
  receptacle: "receptacles",
  light: "lights",
  switch: "switches",
  panel: "panels",
  other: "other devices",
};

export function getManualItemKind(
  item: Pick<ElectricalItemRow, "description" | "category">,
): ManualItemKind {
  return classifyItem(item);
}

export function manualKindPluralLabel(kind: ManualItemKind): string {
  return KIND_PLURAL[kind];
}

function classifyItem(item: Pick<ElectricalItemRow, "description" | "category">): ManualItemKind {
  const cat = d(item.category);
  const desc = d(item.description);
  if (cat === "panel") return "panel";
  if (desc.includes("recept") || desc.includes("outlet") || desc.includes("gfci") || desc.includes("gfi"))
    return "receptacle";
  if (desc.includes("light") || desc.includes("lamp") || desc.includes("fixture"))
    return "light";
  if (desc.includes("switch") || desc.includes("dimmer")) return "switch";
  return "other";
}

/**
 * Room-colored dots: hue from room index; shape from item kind.
 */
export function getManualDotAppearance(
  item: Pick<ElectricalItemRow, "description" | "category">,
  roomIndex: number,
): ManualDotAppearance {
  const base = getManualDotStyle(item);
  if (base.skipDot) {
    return {
      skipDot: true,
      fill: "#ffffff",
      stroke: "#ffffff",
      glyph: "?",
      variant: "ring",
    };
  }
  const h = roomHue(roomIndex);
  const kind = classifyItem(item);
  if (kind === "receptacle") {
    return {
      skipDot: false,
      fill: `hsl(${h} 78% 52%)`,
      stroke: `hsl(${h} 85% 70%)`,
      glyph: "·",
      variant: "filled",
    };
  }
  if (kind === "light") {
    return {
      skipDot: false,
      fill: `hsl(${h} 45% 22%)`,
      stroke: `hsl(${h} 70% 75%)`,
      glyph: "×",
      variant: "ring_x",
    };
  }
  if (kind === "switch") {
    return {
      skipDot: false,
      fill: `hsl(${h} 50% 28%)`,
      stroke: `hsl(${h} 75% 72%)`,
      glyph: "S",
      variant: "ring",
    };
  }
  if (kind === "panel") {
    return {
      skipDot: false,
      fill: `hsl(${h} 55% 26%)`,
      stroke: `hsl(${h} 80% 68%)`,
      glyph: "P",
      variant: "ring",
    };
  }
  return {
    skipDot: false,
    fill: `hsl(${h} 40% 30%)`,
    stroke: `hsl(${h} 65% 75%)`,
    glyph: "?",
    variant: "ring",
  };
}
