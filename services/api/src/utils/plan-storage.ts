import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type PlanStorageMode = "local" | "api_proxy";

type SavePlanUploadParams = {
  projectId: string;
  fileName: string;
  contentBase64: string;
};

type SavePlanUploadResult = {
  localPath: string;
  scannerFileRef: string;
};

type SignedFilePayload = {
  key: string;
  exp: number;
};

function currentDir() {
  return fileURLToPath(new URL(".", import.meta.url));
}

function getUploadRoot(): string {
  return process.env.LOCAL_UPLOAD_DIR ?? resolve(currentDir(), "..", "..", "..", ".uploads", "plans");
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getStorageMode(): PlanStorageMode {
  return process.env.PLAN_STORAGE_MODE === "api_proxy" ? "api_proxy" : "local";
}

function getApiPublicUrl(): string {
  return process.env.API_PUBLIC_URL ?? `http://127.0.0.1:${process.env.API_PORT ?? "4000"}`;
}

function getPlanFileTokenSecret(): string {
  const configured = process.env.PLAN_FILE_TOKEN_SECRET ?? process.env.SESSION_SECRET ?? process.env.JWT_SECRET;
  if (configured) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("PLAN_FILE_TOKEN_SECRET, SESSION_SECRET, or JWT_SECRET must be configured in production.");
  }
  return "local-dev-plan-file-secret";
}

function sign(value: string): string {
  return createHmac("sha256", getPlanFileTokenSecret()).update(value).digest("base64url");
}

function encodeSignedPayload(payload: SignedFilePayload): string {
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(data);
  return `${data}.${signature}`;
}

function decodeSignedPayload(token: string): SignedFilePayload | null {
  const [data, signature] = token.split(".");
  if (!data || !signature) {
    return null;
  }

  const expectedSignature = sign(data);
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const actualBuffer = Buffer.from(signature, "utf8");
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as SignedFilePayload;
    if (!parsed.key || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function buildStoredFileName(projectId: string, fileName: string): string {
  const safeName = sanitizeName(basename(fileName || "import-plan.pdf"));
  const extension = extname(safeName).toLowerCase();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const finalName = safeName || `import-plan${extension || ".pdf"}`;
  return `${projectId}/${projectId}-${timestamp}-${finalName}`;
}

export async function savePlanUpload(params: SavePlanUploadParams): Promise<SavePlanUploadResult> {
  const uploadRoot = getUploadRoot();
  const storageKey = buildStoredFileName(params.projectId, params.fileName);
  const destinationPath = resolve(uploadRoot, storageKey);
  const destinationDir = dirname(destinationPath);

  await mkdir(destinationDir, { recursive: true });
  await writeFile(destinationPath, Buffer.from(params.contentBase64, "base64"));

  if (getStorageMode() === "api_proxy") {
    const token = encodeSignedPayload({
      key: storageKey,
      exp: Date.now() + 1000 * 60 * 60 * 12
    });
    return {
      localPath: destinationPath,
      scannerFileRef: `${getApiPublicUrl()}/api/imports/files?token=${encodeURIComponent(token)}`
    };
  }

  return {
    localPath: destinationPath,
    scannerFileRef: destinationPath
  };
}

export async function readStoredPlanByToken(token: string): Promise<{ content: Buffer; filePath: string } | null> {
  const payload = decodeSignedPayload(token);
  if (!payload) {
    return null;
  }

  const filePath = resolve(getUploadRoot(), payload.key);
  const uploadRoot = resolve(getUploadRoot());
  if (!filePath.startsWith(uploadRoot)) {
    return null;
  }

  try {
    const content = await readFile(filePath);
    return { content, filePath };
  } catch {
    return null;
  }
}

export function shouldProxyPlanUploads(): boolean {
  return getStorageMode() === "api_proxy";
}
