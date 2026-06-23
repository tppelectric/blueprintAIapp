/**
 * JobTread Pave WRITE helpers. Read-only queries stay in `lib/jobtread-client.ts`.
 * Every call requires explicit admin approval in the app — never auto-invoke from sync.
 */

import { jobtreadQuery } from "@/lib/jobtread-client";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

function unwrapPaveRoot(data: Record<string, unknown>): Record<string, unknown> {
  const inner = data.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return data;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * Attach a file to a JobTread job (two-step, per official docs at app.jobtread.com/docs):
 *   1. createUploadRequest({ organizationId, size, type }) -> { id, url, method, headers }
 *   2. upload the bytes to that presigned url using the returned method + headers
 *   3. createFile({ uploadRequestId, name, targetType:"job", targetId }) -> createdFile { id }
 *
 * Server-only. Requires explicit admin approval upstream — never auto-invoke from sync.
 */
export async function createJobtreadJobFile(args: {
  grantKey: string;
  organizationId: string;
  jobtreadJobId: string;
  fileName: string;
  mimeType: string;
  /** File contents (Supabase storage `download()` returns a Blob directly). */
  blob: Blob;
}): Promise<{ fileId: string; name: string }> {
  const fileName = args.fileName.trim() || "receipt";
  if (!args.jobtreadJobId.trim()) {
    throw new Error("JobTread job id is required.");
  }
  if (!args.organizationId.trim()) {
    throw new Error("JobTread organization id is required.");
  }
  if (!args.blob?.size) {
    throw new Error("File contents are required.");
  }

  // Step 1 — request a presigned upload target. GCS enforces an exact
  // content-length-range, so `size` must equal the bytes we upload (blob.size).
  const reqRaw = await jobtreadQuery(args.grantKey, {
    createUploadRequest: {
      $: {
        organizationId: args.organizationId.trim(),
        size: args.blob.size,
        type: args.mimeType || "application/octet-stream",
      },
      createdUploadRequest: { id: {}, url: {}, method: {}, headers: {} },
    },
  });

  const reqRoot = unwrapPaveRoot(reqRaw);
  const reqBlock = asRecord(reqRoot.createUploadRequest);
  const created = reqBlock ? asRecord(reqBlock.createdUploadRequest) : null;
  const uploadId = created ? str(created.id).trim() : "";
  const uploadUrl = created ? str(created.url).trim() : "";
  const uploadMethod = (created ? str(created.method).trim() : "") || "PUT";
  if (!uploadId || !uploadUrl) {
    throw new Error("JobTread did not return an upload request url.");
  }

  // headers come back as either an object map or an array of {name,value} / [name,value].
  const headers: Record<string, string> = {};
  const rawHeaders = created?.headers;
  const headerRecord = asRecord(rawHeaders);
  if (headerRecord) {
    for (const [k, v] of Object.entries(headerRecord)) headers[k] = str(v);
  } else {
    for (const h of asArray(rawHeaders)) {
      const ho = asRecord(h);
      if (ho && ho.name != null) {
        headers[str(ho.name)] = str(ho.value);
      } else if (Array.isArray(h) && h.length >= 2) {
        headers[str(h[0])] = str(h[1]);
      }
    }
  }
  if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
    headers["Content-Type"] = args.mimeType || "application/octet-stream";
  }

  // Step 2 — upload the bytes to the presigned target.
  const putRes = await fetch(uploadUrl, {
    method: uploadMethod,
    headers,
    body: args.blob,
  });
  if (!putRes.ok) {
    const detail = (await putRes.text().catch(() => "")).slice(0, 500);
    throw new Error(
      `Upload to JobTread storage failed (HTTP ${putRes.status}). ${detail}`,
    );
  }

  // Step 3 — register the uploaded file against the job.
  const fileRaw = await jobtreadQuery(args.grantKey, {
    createFile: {
      $: {
        uploadRequestId: uploadId,
        name: fileName,
        targetType: "job",
        targetId: args.jobtreadJobId.trim(),
      },
      createdFile: { id: {}, name: {} },
    },
  });

  const fileRoot = unwrapPaveRoot(fileRaw);
  const fileBlock = asRecord(fileRoot.createFile);
  const createdFile = fileBlock ? asRecord(fileBlock.createdFile) : null;
  const fileId = createdFile ? str(createdFile.id).trim() : "";
  if (!fileId) {
    throw new Error("JobTread did not return a created file id.");
  }
  return { fileId, name: str(createdFile?.name) || fileName };
}

/**
 * Post a comment on a JobTread job (confirmed probe: no organizationId).
 */
export async function createJobtreadJobComment(args: {
  grantKey: string;
  jobtreadJobId: string;
  message: string;
}): Promise<{ commentId: string; message: string }> {
  const message = args.message.trim();
  if (!message) {
    throw new Error("Comment message is required.");
  }
  if (!args.jobtreadJobId.trim()) {
    throw new Error("JobTread job id is required.");
  }

  const raw = await jobtreadQuery(args.grantKey, {
    createComment: {
      $: {
        message,
        targetType: "job",
        targetId: args.jobtreadJobId.trim(),
      },
      createdComment: { id: {}, message: {} },
    },
  });

  const root = unwrapPaveRoot(raw);
  const block = asRecord(root.createComment);
  const created = block ? asRecord(block.createdComment) : null;
  const commentId = created ? str(created.id).trim() : "";
  if (!commentId) {
    throw new Error("JobTread did not return a comment id.");
  }
  return {
    commentId,
    message: str(created?.message) || message,
  };
}
