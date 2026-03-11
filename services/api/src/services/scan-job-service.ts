import type { ScanMode, ScannerExtractResult } from "@package/shared";
import { extractSheetWithScanner, splitSheetsWithScanner } from "../integrations/scanner/client.js";
import { saveBlueprintImportResult } from "../repositories/import-repository.js";
import { updateScanJobProgress } from "../repositories/scan-job-repository.js";
import { getDashboardForProject } from "../repositories/project-repository.js";
import {
  initializeScanJobRuntimeProgress,
  setScanJobAiSecondPassStatus,
  updateScanJobPageProgress
} from "./scan-job-progress-store.js";

export async function runScanJobPipeline(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
  scanJobId: string;
  source: string;
  fileName: string;
  manualScale?: string;
  scanMode: "mock" | "real";
  aiSecondPass?: boolean;
}): Promise<void> {
  await updateScanJobProgress({
    companyId: params.companyId,
    projectId: params.projectId,
    scanJobId: params.scanJobId,
    status: "processing",
    progressPercent: 10,
    currentStep: "Loading plans"
  });

  const detectedSheets = await splitSheetsWithScanner(params.projectId, params.fileName, params.scanMode as ScanMode);
  if (detectedSheets.length === 0) {
    throw new Error("Scanner returned no sheets");
  }
  initializeScanJobRuntimeProgress({
    scanJobId: params.scanJobId,
    aiSecondPassEnabled: Boolean(params.aiSecondPass),
    pages: detectedSheets.map((sheet) => ({
      sheetNumber: sheet.sheet_number,
      title: sheet.title,
      pageNumber: sheet.page_number
    }))
  });

  const extractions: ScannerExtractResult[] = [];
  for (let index = 0; index < detectedSheets.length; index += 1) {
    const sheet = detectedSheets[index];
    const progress = 15 + Math.round(((index + 1) / detectedSheets.length) * 55);
    updateScanJobPageProgress({
      scanJobId: params.scanJobId,
      pageNumber: sheet.page_number,
      status: "processing",
      progressPercent: 45,
      currentStep: `Scanning ${sheet.sheet_number}`
    });
    await updateScanJobProgress({
      companyId: params.companyId,
      projectId: params.projectId,
      scanJobId: params.scanJobId,
      status: "analyzing_symbols",
      progressPercent: progress,
      currentStep: `Detecting electrical symbols (${index + 1}/${detectedSheets.length})`
    });
    const extraction = await extractSheetWithScanner(
      params.projectId,
      sheet.sheet_number,
      params.fileName,
      params.scanMode as ScanMode,
      Boolean(params.aiSecondPass)
    );
    extractions.push(extraction);
    updateScanJobPageProgress({
      scanJobId: params.scanJobId,
      pageNumber: sheet.page_number,
      status: "completed",
      progressPercent: 100,
      currentStep: Boolean(params.aiSecondPass) ? "Scan complete with AI review" : "Scan complete"
    });
  }

  setScanJobAiSecondPassStatus(params.scanJobId, params.aiSecondPass ? "completed" : "skipped");
  await updateScanJobProgress({
    companyId: params.companyId,
    projectId: params.projectId,
    scanJobId: params.scanJobId,
    status: "grouping_devices",
    progressPercent: 78,
    currentStep: "Grouping devices by room"
  });

  await saveBlueprintImportResult({
    companyId: params.companyId,
    projectId: params.projectId,
    jobId: params.jobId,
    source: params.source,
    fileName: params.fileName,
    manualScale: params.manualScale,
    scanMode: params.scanMode,
    sheets: detectedSheets,
    extractions
  });

  await updateScanJobProgress({
    companyId: params.companyId,
    projectId: params.projectId,
    scanJobId: params.scanJobId,
    status: "generating_takeoff",
    progressPercent: 92,
    currentStep: "Generating takeoff"
  });

  const dashboard = await getDashboardForProject(params.companyId, params.projectId, params.jobId);
  if (!dashboard) {
    throw new Error("Scan saved but dashboard refresh failed");
  }

  await updateScanJobProgress({
    companyId: params.companyId,
    projectId: params.projectId,
    scanJobId: params.scanJobId,
    status: "completed",
    progressPercent: 100,
    currentStep: "Scan complete",
    completed: true
  });
}
