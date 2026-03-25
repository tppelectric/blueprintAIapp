export const REFERENCE_DOC_CATEGORIES = [
  "Code",
  "Utility",
  "Vendor",
  "Company",
  "Other",
] as const;

export type ReferenceDocCategory = (typeof REFERENCE_DOC_CATEGORIES)[number];

export function isReferenceDocCategory(
  v: string | null | undefined,
): v is ReferenceDocCategory {
  return (
    v === "Code" ||
    v === "Utility" ||
    v === "Vendor" ||
    v === "Company" ||
    v === "Other"
  );
}

export type ReferenceDocumentRow = {
  id: string;
  title: string;
  category: ReferenceDocCategory;
  file_path: string;
  file_size: number;
  uploaded_by: string;
  created_at: string;
};
