import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { resolveCompanyId } from "../utils/tenant.js";
import { getDbPool } from "../db/postgres.js";
import {
  createScanJob,
  getLatestImportedFileForScan,
  getScanJobById,
  updateScanJobProgress
} from "../repositories/scan-job-repository.js";
import { getScanJobRuntimeProgress } from "../services/scan-job-progress-store.js";
import { runScanJobPipeline } from "../services/scan-job-service.js";
import { savePlanUpload } from "../utils/plan-storage.js";

const uploadSchema = z.object({
  fileName: z.string().min(1),
  contentBase64: z.string().min(1),
  contentType: z.string().optional()
});

const createScanJobSchema = z.object({
  jobId: z.string().min(1).optional(),
  source: z.enum(["local", "onedrive", "google-drive", "apple-files"]).optional().default("local"),
  fileName: z.string().min(1).optional(),
  fileNames: z.array(z.string().min(1)).optional(),
  upload: uploadSchema.optional(),
  uploads: z.array(uploadSchema).min(1).optional(),
  manualScale: z.string().trim().min(1).optional(),
  scanMode: z.enum(["mock", "real"]).optional().default("real"),
  aiSecondPass: z.boolean().optional().default(false)
});

export const scanJobRoutes: FastifyPluginAsync = async (app) => {
  app.post("/projects/:projectId/scan-jobs", async (request, reply) => {
    const params = request.params as { projectId: string };
    const parsed = createScanJobSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid scan job payload", issues: parsed.error.flatten() });
    }

    const companyId = resolveCompanyId(request);
    const pool = getDbPool();

    try {
      const projectCheck = await pool.query(
        `
        SELECT id
        FROM projects
        WHERE company_id::text = $1
          AND id::text = $2
        LIMIT 1
        `,
        [companyId, params.projectId]
      );
      if (projectCheck.rows.length === 0) {
        return reply.code(404).send({ message: "Project not found for company scope." });
      }

      if (parsed.data.jobId) {
        const jobCheck = await pool.query(
          `
          SELECT id
          FROM project_jobs
          WHERE company_id = $1
            AND project_id = $2
            AND id = $3
          LIMIT 1
          `,
          [companyId, params.projectId, parsed.data.jobId]
        );
        if (jobCheck.rows.length === 0) {
          return reply.code(404).send({ message: "Job not found for project scope." });
        }
      }

      const uploadItems = parsed.data.uploads ?? (parsed.data.upload ? [parsed.data.upload] : []);
      const resolvedFiles: string[] = [];

      if (uploadItems.length > 0) {
        for (const upload of uploadItems) {
          const storedUpload = await savePlanUpload({
            projectId: params.projectId,
            fileName: upload.fileName,
            contentBase64: upload.contentBase64
          });
          resolvedFiles.push(storedUpload.scannerFileRef);
        }
      } else if (parsed.data.fileNames && parsed.data.fileNames.length > 0) {
        resolvedFiles.push(...parsed.data.fileNames);
      } else if (parsed.data.fileName) {
        resolvedFiles.push(parsed.data.fileName);
      } else {
        const latestFile = await getLatestImportedFileForScan({
          companyId,
          projectId: params.projectId,
          jobId: parsed.data.jobId
        });
        if (latestFile) {
          resolvedFiles.push(latestFile);
        }
      }
      if (resolvedFiles.length === 0) {
        return reply.code(404).send({
          message: "No imported plans found. Upload plans before starting a scan job."
        });
      }
      const finalResolvedFiles = resolvedFiles;

      const scanJob = await createScanJob({
        companyId,
        projectId: params.projectId,
        jobId: parsed.data.jobId,
        source: parsed.data.source,
        fileName: finalResolvedFiles.length === 1 ? finalResolvedFiles[0] : `${finalResolvedFiles.length} files`,
        scanMode: parsed.data.scanMode
      });

      // Non-blocking background execution.
      void (async () => {
        try {
          await runScanJobPipeline({
            companyId,
            projectId: params.projectId,
            jobId: parsed.data.jobId,
            scanJobId: scanJob.id,
            source: parsed.data.source,
            fileNames: finalResolvedFiles,
            manualScale: parsed.data.manualScale,
            scanMode: parsed.data.scanMode,
            aiSecondPass: parsed.data.aiSecondPass
          });
        } catch (error) {
          await updateScanJobProgress({
            companyId,
            projectId: params.projectId,
            scanJobId: scanJob.id,
            status: "failed",
            progressPercent: 100,
            currentStep: "Scan failed",
            errorMessage: (error as Error).message,
            completed: true
          });
        }
      })();

      return reply.code(202).send({
        companyId,
        projectId: params.projectId,
        jobId: parsed.data.jobId ?? null,
        scanJob: {
          ...scanJob,
          aiSecondPass: parsed.data.aiSecondPass
        }
      });
    } catch (error) {
      return reply.code(502).send({ message: "Could not create scan job", detail: (error as Error).message });
    }
  });

  app.get("/projects/:projectId/scan-jobs/:scanJobId", async (request, reply) => {
    const params = request.params as { projectId: string; scanJobId: string };
    const companyId = resolveCompanyId(request);

    try {
      const scanJob = await getScanJobById({
        companyId,
        projectId: params.projectId,
        scanJobId: params.scanJobId
      });
      if (!scanJob) {
        return reply.code(404).send({ message: "Scan job not found for project scope." });
      }
      const runtimeProgress = getScanJobRuntimeProgress(scanJob.id);
      return {
        companyId,
        projectId: params.projectId,
        scanJob: {
          ...scanJob,
          aiSecondPass: runtimeProgress?.aiSecondPassEnabled ?? false,
          aiSecondPassStatus: runtimeProgress?.aiSecondPassStatus ?? "idle",
          pageProgress: runtimeProgress?.pageProgress ?? []
        }
      };
    } catch (error) {
      return reply.code(502).send({ message: "Could not load scan job", detail: (error as Error).message });
    }
  });
};
