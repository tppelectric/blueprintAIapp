import { isElectricalSymbolRow } from "@/lib/project-symbol-types";

/** Raw row from project_symbols (GET) for building Claude context. */
export type LegendContextRow = {
  symbol_description?: string | null;
  symbol_category?: string | null;
  confidence?: number | null;
  note_category?: string | null;
};

/**
 * Text appended to analysis prompts: electrical legend symbols + electrical
 * plan notes only (excludes general / other-trade note rows).
 */
export function buildAnalysisLegendAppendix(rows: LegendContextRow[]): string {
  if (!rows.length) return "";

  const symbolPart = rows
    .filter(isElectricalSymbolRow)
    .map((r) => ({
      symbol_description: String(r.symbol_description ?? "").trim(),
      symbol_category: String(r.symbol_category ?? "other").trim(),
      confidence: Number(r.confidence),
    }))
    .filter((r) => r.symbol_description.length > 0);

  const electricalNotes = rows
    .filter((r) => r.note_category === "electrical_note")
    .map((r) => String(r.symbol_description ?? "").trim())
    .filter(Boolean);

  let out = "";
  if (symbolPart.length > 0) {
    const lines = symbolPart.map((r) => {
      const c = Number.isFinite(r.confidence)
        ? r.confidence.toFixed(2)
        : "?";
      return `- ${r.symbol_description} (${r.symbol_category}, model confidence ${c})`;
    });
    out += `

CONFIRMED SYMBOL LEGEND FOR THIS PROJECT:
The following symbols were found in this project legend and should be used as the reference for identifying items on this page:
${lines.join("\n")}

When you identify a symbol that matches the legend:
- Use the exact description from the legend
- Set confidence to 0.90 or higher
- This is a confirmed symbol not a guess`;
  }
  if (electricalNotes.length > 0) {
    out += `

ELECTRICAL PLAN NOTES FOR THIS PROJECT:
${electricalNotes.map((n) => `- ${n}`).join("\n")}`;
  }
  return out;
}
