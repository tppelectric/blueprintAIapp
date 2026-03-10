import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { NextResponse } from "next/server";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:4000";
const uploadRoot = process.env.LOCAL_UPLOAD_DIR ?? resolve(process.cwd(), "..", "..", ".uploads", "plans");

const ALLOWED_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg"]);

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function forwardJson(payload: unknown, request: Request): Promise<NextResponse> {
  const headers = new Headers();
  const authHeader = request.headers.get("authorization");
  const companyHeader = request.headers.get("x-company-id");

  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  if (companyHeader) {
    headers.set("x-company-id", companyHeader);
  }
  headers.set("content-type", "application/json");

  try {
    const response = await fetch(`${apiBaseUrl}/api/imports/plans`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json") ? await response.json() : { message: await response.text() };
    return NextResponse.json(body, { status: response.status });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    const payload = await request.json();
    return forwardJson(payload, request);
  }

  const form = await request.formData();
  const projectId = String(form.get("projectId") ?? "").trim();
  const jobId = String(form.get("jobId") ?? "").trim();
  const source = String(form.get("source") ?? "local").trim();
  const scanMode = String(form.get("scanMode") ?? "mock").trim();
  const manualScale = String(form.get("manualScale") ?? "").trim();
  const providedName = String(form.get("fileName") ?? "").trim();
  const files = form
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const legacyFile = form.get("file");
  if (files.length === 0 && legacyFile instanceof File && legacyFile.size > 0) {
    files.push(legacyFile);
  }

  if (!projectId) {
    return NextResponse.json({ message: "projectId is required." }, { status: 400 });
  }

  if (files.length === 0) {
    return NextResponse.json({ message: "A plan file is required for upload." }, { status: 400 });
  }
  const destinationDir = resolve(uploadRoot, projectId);
  await mkdir(destinationDir, { recursive: true });

  const uploadedFilePaths: string[] = [];
  const results: Array<{ status: number; payload: unknown }> = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const rawName = i === 0 && providedName ? providedName : file.name || `import-plan-${i + 1}.pdf`;
    const safeName = sanitizeName(basename(rawName));
    const extension = extname(safeName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return NextResponse.json({ message: "Unsupported file type. Use PDF, PNG, JPG, or JPEG." }, { status: 400 });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const finalName = `${projectId}-${timestamp}-${i + 1}-${safeName}`;
    const destinationPath = resolve(destinationDir, finalName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(destinationPath, buffer);
    uploadedFilePaths.push(destinationPath);

    const response = await forwardJson(
      {
        projectId,
        jobId: jobId || undefined,
        source,
        scanMode,
        manualScale: manualScale || undefined,
        fileName: destinationPath
      },
      request
    );
    results.push({ status: response.status, payload: await response.json() });
  }

  const failed = results.find((entry) => entry.status >= 400);
  if (failed) {
    return NextResponse.json(
      {
        ...(failed.payload as Record<string, unknown>),
        uploadedFilePaths
      },
      { status: failed.status }
    );
  }

  const finalPayload = results[results.length - 1]?.payload as Record<string, unknown>;
  return NextResponse.json(
    {
      ...finalPayload,
      uploadedFilePaths,
      importedFiles: uploadedFilePaths.length
    },
    { status: 200 }
  );
}
