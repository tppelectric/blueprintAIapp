export type SymbolLibraryRow = {
  id: string;
  company_id: string;
  description: string;
  category: string;
  symbol_image_base64: string | null;
  usage_count: number;
  created_from_project: string | null;
  created_at: string;
  /** From API join */
  project_ids?: string[];
};
