import { createBrowserClient } from "@/lib/supabase/client";
import {
  buildBlueprintUploadObjectPath,
  normalizeBlueprintStoragePath,
} from "@/lib/storage-path";

const BLUEPRINTS_BUCKET = "blueprints";

/** Matches @supabase/storage-js signed-upload multipart shape (cacheControl + file under empty field name). */
const SIGNED_UPLOAD_CACHE_CONTROL = "3600";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;

function uploadFileToSignedUrlWithProgress(
  signedUrl: string,
  file: File,
  onRawProgress: (loaded: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    const body = new FormData();
    body.append("cacheControl", SIGNED_UPLOAD_CACHE_CONTROL);
    body.append("", file);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && ev.total > 0) {
        onRawProgress(ev.loaded, ev.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      const msg =
        xhr.responseText?.trim() ||
        `Storage upload failed (${xhr.status}).`;
      reject(new Error(msg));
    };
    xhr.onerror = () =>
      reject(new Error("Network error while uploading to storage."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(body);
  });
}

export type UploadedSheetPayload = {
  /** Storage object path in the `blueprints` bucket (e.g. uploads/uuid-slug.pdf), never a public URL. */
  storagePath: string;
  sheetName: string;
  fileSize: number;
  originalFileName: string;
};

/**
 * Uploads a PDF from the browser to Supabase Storage via a signed upload URL, then PUTs the file
 * directly to Supabase (XHR + upload progress). No file bytes pass through Next.js or Vercel
 * serverless (avoids FUNCTION_PAYLOAD_TOO_LARGE / proxy body limits).
 *
 * Requires storage policies allowing authenticated signed uploads / inserts on `blueprints`.
 */
export async function uploadPdfFileToStorage(
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadedSheetPayload> {
  if (file.size <= 0) {
    throw new Error("Empty file.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("File is too large (max 5 GB).");
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

  onProgress(2);
  const objectPath = buildBlueprintUploadObjectPath(file.name);
  const supabase = createBrowserClient();

  onProgress(8);
  const { data: signData, error: signError } = await supabase.storage
    .from(BLUEPRINTS_BUCKET)
    .createSignedUploadUrl(objectPath, { upsert: false });

  if (signError || !signData?.signedUrl || !signData.token) {
    throw new Error(
      signError?.message ??
        "Could not start upload. Check you are signed in and storage allows signed uploads.",
    );
  }

  onProgress(12);
  await uploadFileToSignedUrlWithProgress(
    signData.signedUrl,
    file,
    (loaded, total) => {
      const ratio = total > 0 ? loaded / total : 0;
      onProgress(12 + Math.round(ratio * 86));
    },
  );

  onProgress(100);

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
