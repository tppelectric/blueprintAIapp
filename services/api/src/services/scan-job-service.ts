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
  fileNames: string[];
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

  const fileRuns: Array<{
    sourceFileName: string;
    detectedSheets: Awaited<ReturnType<typeof splitSheetsWithScanner>>;
  }> = [];

  for (let fileIndex = 0; fileIndex < params.fileNames.length; fileIndex += 1) {
    const fileName = params.fileNames[fileIndex];
    await updateScanJobProgress({
      companyId: params.companyId,
      projectId: params.projectId,
      scanJobId: params.scanJobId,
      status: "processing",
      progressPercent: 10 + Math.round(((fileIndex + 1) / params.fileNames.length) * 15),
      currentStep: `Loading plan file ${fileIndex + 1} of ${params.fileNames.length}`
    });

    const detectedSheets = await splitSheetsWithScanner(params.projectId, fileName, params.scanMode as ScanMode);
    if (detectedSheets.length === 0) {
      throw new Error(`Scanner returned no sheets for ${fileName}`);
    }
    fileRuns.push({ sourceFileName: fileName, detectedSheets });
  }

  initializeScanJobRuntimeProgress({
    scanJobId: params.scanJobId,
    aiSecondPassEnabled: Boolean(params.aiSecondPass),
    pages: fileRuns.flatMap((fileRun) =>
      fileRun.detectedSheets.map((sheet) => ({
        id: `${fileRun.sourceFileName}:${sheet.sheet_number}:${sheet.page_number}`,
        sourceFileName: fileRun.sourceFileName,
        sheetNumber: sheet.sheet_number,
        title: sheet.title,
        pageNumber: sheet.page_number
      }))
    )
  });

  const totalSheets = fileRuns.reduce((sum, fileRun) => sum + fileRun.detectedSheets.length, 0);
  let processedSheets = 0;

  for (const fileRun of fileRuns) {
    const extractions: ScannerExtractResult[] = [];

    for (const sheet of fileRun.detectedSheets) {
      processedSheets += 1;
      const progress = 25 + Math.round((processedSheets / totalSheets) * 45);
      const pageId = `${fileRun.sourceFileName}:${sheet.sheet_number}:${sheet.page_number}`;

      updateScanJobPageProgress({
        scanJobId: params.scanJobId,
        pageId,
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
        currentStep: `Detecting electrical symbols (${processedSheets}/${totalSheets})`
      });
      const extraction = await extractSheetWithScanner(
        params.projectId,
        sheet.sheet_number,
        fileRun.sourceFileName,
        params.scanMode as ScanMode,
        Boolean(params.aiSecondPass)
      );
      extractions.push(extraction);
      updateScanJobPageProgress({
        scanJobId: params.scanJobId,
        pageId,
        status: "completed",
        progressPercent: 100,
        currentStep: Boolean(params.aiSecondPass) ? "Scan complete with AI review" : "Scan complete"
      });
    }

    await saveBlueprintImportResult({
      companyId: params.companyId,
      projectId: params.projectId,
      jobId: params.jobId,
      source: params.source,
      fileName: fileRun.sourceFileName,
      manualScale: params.manualScale,
      scanMode: params.scanMode,
      sheets: fileRun.detectedSheets,
      extractions
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
