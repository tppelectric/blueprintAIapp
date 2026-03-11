type PageProgressStatus = "queued" | "processing" | "completed" | "failed";

export type ScanJobPageProgress = {
  id: string;
  sourceFileName: string;
  sheetNumber: string;
  title: string;
  pageNumber: number;
  status: PageProgressStatus;
  progressPercent: number;
  currentStep: string;
};

export type ScanJobRuntimeProgress = {
  aiSecondPassEnabled: boolean;
  aiSecondPassStatus: "idle" | "running" | "completed" | "skipped";
  pageProgress: ScanJobPageProgress[];
};

const runtimeProgressByJobId = new Map<string, ScanJobRuntimeProgress>();

export function initializeScanJobRuntimeProgress(params: {
  scanJobId: string;
  aiSecondPassEnabled: boolean;
  pages: Array<{ id: string; sourceFileName: string; sheetNumber: string; title: string; pageNumber: number }>;
}): void {
  runtimeProgressByJobId.set(params.scanJobId, {
    aiSecondPassEnabled: params.aiSecondPassEnabled,
    aiSecondPassStatus: params.aiSecondPassEnabled ? "running" : "skipped",
    pageProgress: params.pages.map((page) => ({
      id: page.id,
      sourceFileName: page.sourceFileName,
      sheetNumber: page.sheetNumber,
      title: page.title,
      pageNumber: page.pageNumber,
      status: "queued",
      progressPercent: 0,
      currentStep: "Queued"
    }))
  });
}

export function updateScanJobPageProgress(params: {
  scanJobId: string;
  pageId: string;
  status: PageProgressStatus;
  progressPercent: number;
  currentStep: string;
}): void {
  const current = runtimeProgressByJobId.get(params.scanJobId);
  if (!current) {
    return;
  }

  current.pageProgress = current.pageProgress.map((page) =>
    page.id === params.pageId
      ? {
          ...page,
          status: params.status,
          progressPercent: Math.max(0, Math.min(100, Math.round(params.progressPercent))),
          currentStep: params.currentStep
        }
      : page
  );
}

export function setScanJobAiSecondPassStatus(
  scanJobId: string,
  status: ScanJobRuntimeProgress["aiSecondPassStatus"]
): void {
  const current = runtimeProgressByJobId.get(scanJobId);
  if (!current) {
    return;
  }
  current.aiSecondPassStatus = status;
}

export function getScanJobRuntimeProgress(scanJobId: string): ScanJobRuntimeProgress | null {
  return runtimeProgressByJobId.get(scanJobId) ?? null;
}

export function clearScanJobRuntimeProgress(scanJobId: string): void {
  runtimeProgressByJobId.delete(scanJobId);
}
