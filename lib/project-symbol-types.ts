export type SymbolBBox = {
  nx: number;
  ny: number;
  nw: number;
  nh: number;
};

/** Row from legend scan: electrical symbol vs categorized plan notes. */
export type NoteCategory =
  | "symbol"
  | "electrical_note"
  | "general_note"
  | "other_trade_note";

export type ProjectSymbolRow = {
  id: string;
  project_id: string;
  symbol_description: string;
  symbol_category: string;
  confidence: number;
  source_page: number;
  user_confirmed: boolean;
  created_at: string;
  /** null/undefined treated as symbol (pre-migration rows). */
  note_category?: NoteCategory | string | null;
  symbol_image_base64?: string | null;
  symbol_bbox?: SymbolBBox | null;
  capture_page?: number | null;
  capture_x_percent?: number | string | null;
  capture_y_percent?: number | string | null;
  capture_width_percent?: number | string | null;
  capture_height_percent?: number | string | null;
  match_count?: number | null;
  verified_by?: string | null;
  source_library_id?: string | null;
};

/** True when this row is an electrical legend symbol (not a plan note). */
export function isElectricalSymbolRow(row: {
  note_category?: string | null;
}): boolean {
  const c = row.note_category;
  return c == null || c === "" || c === "symbol";
}
