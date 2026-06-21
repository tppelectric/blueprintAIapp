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

/**
 * Post a comment on a JobTread job (confirmed probe: no organizationId).
 * TODO(20a-image): After createUploadRequest + createFile flow is confirmed,
 * attach receipt image separately — do not use uploadFiles (not a root mutation).
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
