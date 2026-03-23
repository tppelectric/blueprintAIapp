import { createBrowserClient } from "@/lib/supabase/client";
import { normalizeBlueprintStoragePath } from "@/lib/storage-path";

export type UploadedSheetPayload = {
  /** Storage object path in the `blueprints` bucket (e.g. uploads/uuid-slug.pdf), never a public URL. */
  storagePath: string;
  sheetName: string;
  fileSize: number;
  originalFileName: string;
};

/**
 * Uploads one PDF via POST /api/upload-pdf (server uses service role + private bucket).
 * The browser never sees the service role key.
 */
export async function uploadPdfFileToStorage(
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadedSheetPayload> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload-pdf");

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && e.total > 0) {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(Math.min(99, pct));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        try {
          const json = JSON.parse(xhr.responseText) as {
            storagePath?: string;
            fileSize?: number;
            originalFileName?: string;
            error?: string;
          };
          if (json.error) {
            reject(new Error(json.error));
            return;
          }
          if (!json.storagePath) {
            reject(new Error("Upload succeeded but no storage path returned."));
            return;
          }
          const path = normalizeBlueprintStoragePath(json.storagePath);
          if (!path.startsWith("uploads/")) {
            reject(new Error("Server returned an unexpected storage path."));
            return;
          }
          const sheetName =
            file.name.replace(/\.pdf$/i, "").trim() || file.name;
          resolve({
            storagePath: path,
            sheetName,
            fileSize: json.fileSize ?? file.size,
            originalFileName: json.originalFileName ?? file.name,
          });
        } catch {
          reject(new Error("Invalid response from upload server."));
        }
        return;
      }
      let message = `Upload failed (${xhr.status}).`;
      try {
        const parsed = JSON.parse(xhr.responseText) as { error?: string };
        if (parsed.error) message = parsed.error;
      } catch {
        if (xhr.responseText) message = xhr.responseText.slice(0, 200);
      }
      reject(new Error(message));
    });

    xhr.addEventListener("error", () => {
      reject(
        new Error(
          "Network error while uploading. Check your connection and try again.",
        ),
      );
    });

    const body = new FormData();
    body.append("file", file);
    xhr.send(body);
  });
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
