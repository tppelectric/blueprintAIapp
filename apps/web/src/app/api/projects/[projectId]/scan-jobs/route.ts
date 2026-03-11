import { NextResponse } from "next/server";
import { proxyPostJson } from "../../../../../lib/api-proxy";

async function fileToBase64(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return buffer.toString("base64");
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    const body = await request.json();
    return proxyPostJson(request, `/api/projects/${projectId}/scan-jobs`, body);
  }

  const form = await request.formData();
  const source = String(form.get("source") ?? "local").trim();
  const scanMode = String(form.get("scanMode") ?? "real").trim();
  const manualScale = String(form.get("manualScale") ?? "").trim();
  const jobId = String(form.get("jobId") ?? "").trim();
  const aiSecondPass = String(form.get("aiSecondPass") ?? "false").trim().toLowerCase() === "true";
  const fileName = String(form.get("fileName") ?? "").trim();
  const files = form
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (source === "local" && files.length === 0 && !fileName) {
    return NextResponse.json({ message: "Select at least one plan file before starting the scan." }, { status: 400 });
  }

  const uploads =
    files.length > 0
      ? await Promise.all(
          files.map(async (file) => ({
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            contentBase64: await fileToBase64(file)
          }))
        )
      : undefined;

  return proxyPostJson(request, `/api/projects/${projectId}/scan-jobs`, {
    jobId: jobId || undefined,
    source,
    fileName: uploads ? undefined : fileName || undefined,
    uploads,
    scanMode,
    manualScale: manualScale || undefined,
    aiSecondPass
  });
}
