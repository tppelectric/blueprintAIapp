import type { ScanMode, ScannerDetectedSheet, ScannerExtractResult } from "@package/shared";

const scannerBaseUrl = process.env.SCANNER_URL ?? "http://127.0.0.1:8001";

async function scannerPost<TResponse>(path: string, payload: object): Promise<TResponse> {
  const response = await fetch(`${scannerBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Scanner request failed (${response.status})`);
  }

  return (await response.json()) as TResponse;
}

export async function splitSheetsWithScanner(
  projectId: string,
  fileName: string,
  scanMode: ScanMode
): Promise<ScannerDetectedSheet[]> {
  const payload = await scannerPost<{ sheets: ScannerDetectedSheet[] }>("/scan/split-sheets", {
    project_id: projectId,
    file_name: fileName,
    scan_mode: scanMode
  });

  return payload.sheets;
}

export async function extractSheetWithScanner(
  projectId: string,
  sheetId: string,
  fileName: string,
  scanMode: ScanMode
): Promise<ScannerExtractResult> {
  return await scannerPost<ScannerExtractResult>("/scan/extract", {
    project_id: projectId,
    sheet_id: sheetId,
    file_name: fileName,
    scan_mode: scanMode
  });
}
