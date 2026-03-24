import { createBrowserClient } from "@/lib/supabase/client";
import {
  buildBlueprintUploadObjectPath,
  normalizeBlueprintStoragePath,
} from "@/lib/storage-path";

const BLUEPRINTS_BUCKET = "blueprints";

export type UploadedSheetPayload = {
  /** Storage object path in the `blueprints` bucket (e.g. uploads/uuid-slug.pdf), never a public URL. */
  storagePath: string;
  sheetName: string;
  fileSize: number;
  originalFileName: string;
};

/**
 * Uploads a PDF directly from the browser to Supabase Storage using the user's session.
 * Bypasses Vercel's ~4.5MB serverless body limit (no file bytes through Next.js API).
 *
 * Requires storage RLS allowing authenticated `INSERT` on `blueprints` / `uploads/*`
 * (see `supabase/storage_blueprints_client_upload.sql`).
 */
export async function uploadPdfFileToStorage(
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadedSheetPayload> {
  if (file.size <= 0) {
    throw new Error("Empty file.");
  }

  const type = file.type;
  if (
    type &&
    type !== "application/pdf" &&
    type !== "application/octet-stream" &&
    type !== "application/x-pdf"
  ) {
    throw new Error("Only PDF uploads are allowed.");
  }

  onProgress(5);
  const objectPath = buildBlueprintUploadObjectPath(file.name);
  const supabase = createBrowserClient();

  onProgress(25);
  const { error } = await supabase.storage
    .from(BLUEPRINTS_BUCKET)
    .upload(objectPath, file, {
      contentType: "application/pdf",
      upsert: false,
    });

  onProgress(100);

  if (error) {
    throw new Error(
      error.message ||
        "Storage upload failed. Check you are signed in and storage policies allow uploads.",
    );
  }

  const path = normalizeBlueprintStoragePath(objectPath);
  if (!path.startsWith("uploads/")) {
    throw new Error("Unexpected storage path after upload.");
  }

  const sheetName =
    file.name.replace(/\.pdf$/i, "").trim() || file.name;

  return {
    storagePath: path,
    sheetName,
    fileSize: file.size,
    originalFileName: file.name,
  };
}

/**
 * Inserts project + sheets using the anon Supabase client (browser).
 * `file_url` must be the object path only (e.g. uploads/uuid-slug.pdf).
 */
export async function insertProjectAndSheets(
  projectName: string,
  sheets: UploadedSheetPayload[],
): Promise<{ projectId: string }> {
  if (sheets.length === 0) {
    throw new Error("No files to save.");
  }

  const supabase = createBrowserClient();
  const first = sheets[0]!;
  const totalSize = sheets.reduce((s, x) => s + x.fileSize, 0);

  const paths = sheets.map((s) => normalizeBlueprintStoragePath(s.storagePath));
  if (paths.some((p) => !p.startsWith("uploads/"))) {
    throw new Error("Invalid storage path for database insert.");
  }

  const { data: projectRow, error: projectError } = await supabase
    .from("projects")
    .insert({
      project_name: projectName.trim(),
      sheet_count: sheets.length,
      file_name: first.originalFileName,
      file_url: paths[0]!,
      file_size: totalSize,
    })
    .select("id")
    .single();

  if (projectError || !projectRow?.id) {
    throw new Error(
      projectError?.message ??
        "Saved files to storage but could not create the project record.",
    );
  }

  const projectId = projectRow.id as string;

  const { error: sheetsError } = await supabase.from("sheets").insert(
    sheets.map((sh, i) => ({
      project_id: projectId,
      sheet_name: sh.sheetName,
      file_url: paths[i]!,
      file_size: sh.fileSize,
      sheet_order: i,
    })),
  );

  if (sheetsError) {
    throw new Error(
      sheetsError.message ??
        "Created the project but could not save sheet records.",
    );
  }

  return { projectId };
}
