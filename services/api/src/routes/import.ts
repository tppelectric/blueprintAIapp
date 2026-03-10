import type { ScanMode, ScannerExtractResult } from "@package/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { extractSheetWithScanner, splitSheetsWithScanner } from "../integrations/scanner/client.js";
import { getLatestImportedFileForProject, saveBlueprintImportResult } from "../repositories/import-repository.js";
import { getDashboardForProject } from "../repositories/project-repository.js";
import { resolveCompanyId } from "../utils/tenant.js";

const importSchema = z.object({
  projectId: z.string().min(1),
  jobId: z.string().min(1).optional(),
  source: z.enum(["local", "onedrive", "google-drive", "apple-files"]),
  fileName: z.string().optional(),
  manualScale: z.string().trim().min(1).optional(),
  scanMode: z.enum(["mock", "real"]).optional().default("mock")
});

const rescanSchema = z.object({
  jobId: z.string().min(1).optional(),
  fileName: z.string().min(1).optional(),
  source: z.enum(["local", "onedrive", "google-drive", "apple-files"]).optional().default("local"),
  manualScale: z.string().trim().min(1).optional(),
  scanMode: z.enum(["mock", "real"]).optional().default("real")
});

async function runImportPipeline(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
  source: string;
  resolvedFile: string;
  manualScale?: string;
  scanMode: "mock" | "real";
}) {
  const detectedSheets = await splitSheetsWithScanner(params.projectId, params.resolvedFile, params.scanMode as ScanMode);
  if (detectedSheets.length === 0) {
    throw new Error("Scanner returned no sheets");
  }

  const extractions: ScannerExtractResult[] = [];
  for (const sheet of detectedSheets) {
    const extraction = await extractSheetWithScanner(
      params.projectId,
      sheet.sheet_number,
      params.resolvedFile,
      params.scanMode as ScanMode
    );
    extractions.push(extraction);
  }

  await saveBlueprintImportResult({
    companyId: params.companyId,
    projectId: params.projectId,
    jobId: params.jobId,
    source: params.source,
    fileName: params.resolvedFile,
    manualScale: params.manualScale,
    scanMode: params.scanMode,
    sheets: detectedSheets,
    extractions
  });

  const dashboard = await getDashboardForProject(params.companyId, params.projectId, params.jobId);
  if (!dashboard) {
    throw new Error("Import persisted but dashboard data unavailable");
  }

  return {
    dashboard,
    scaleSummary: detectedSheets.map((sheet, index) => ({
      sheetNumber: sheet.sheet_number,
      pageNumber: sheet.page_number,
      detectedScale: extractions[index]?.detected_scale ?? null,
      needsInput:
        extractions[index]?.scale_needs_input === true &&
        !params.manualScale
    }))
  };
}

export const importRoutes: FastifyPluginAsync = async (app) => {
  app.post("/imports/plans", async (request, reply) => {
    const parsed = importSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid import payload", issues: parsed.error.flatten() });
    }

    const companyId = resolveCompanyId(request);
    const { projectId, jobId, source, fileName, manualScale, scanMode } = parsed.data;
    const resolvedFile = fileName ?? `${source}-import.pdf`;

    try {
      const result = await runImportPipeline({
        companyId,
        projectId,
        jobId,
        source,
        resolvedFile,
        manualScale,
        scanMode
      });

      return {
        companyId,
        dashboard: result.dashboard,
        scanner: {
          mode: scanMode,
          status: "processed",
          scaleSummary: result.scaleSummary
        }
      };
    } catch (error) {
      app.log.error(`Import failed: ${(error as Error).message}`);
      return reply.code(502).send({
        message: "Import failed. Scanner and database must be available.",
        detail: (error as Error).message
      });
    }
  });

  app.post("/projects/:projectId/rescan", async (request, reply) => {
    const params = request.params as { projectId: string };
    const parsed = rescanSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid rescan payload", issues: parsed.error.flatten() });
    }

    const companyId = resolveCompanyId(request);
    const { jobId, fileName, source, manualScale, scanMode } = parsed.data;

    try {
      const latestFile = await getLatestImportedFileForProject({
        companyId,
        projectId: params.projectId,
        jobId
      });
      const resolvedFile = fileName ?? latestFile;
      if (!resolvedFile) {
        return reply.code(404).send({
          message: "No imported plans found for rescan. Import plans first."
        });
      }

      const result = await runImportPipeline({
        companyId,
        projectId: params.projectId,
        jobId,
        source,
        resolvedFile,
        manualScale,
        scanMode
      });

      return {
        companyId,
        projectId: params.projectId,
        jobId: jobId ?? null,
        dashboard: result.dashboard,
        scanner: {
          mode: scanMode,
          status: "rescanned",
          fileName: resolvedFile,
          scaleSummary: result.scaleSummary
        }
      };
    } catch (error) {
      app.log.error(`Rescan failed: ${(error as Error).message}`);
      return reply.code(502).send({
        message: "Rescan failed. Scanner and database must be available.",
        detail: (error as Error).message
      });
    }
  });
};

