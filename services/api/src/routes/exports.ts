import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { listProjectExportJobs, queueProjectExportJob } from "../repositories/export-repository.js";
import { resolveCompanyId } from "../utils/tenant.js";

const exportJobSchema = z.object({
  jobId: z.string().min(1).optional()
});

export const exportRoutes: FastifyPluginAsync = async (app) => {
  app.get("/projects/:projectId/exports", async (request, reply) => {
    const params = request.params as { projectId: string };
    const query = request.query as { jobId?: string };
    const companyId = resolveCompanyId(request);

    try {
      const exports = await listProjectExportJobs({
        companyId,
        projectId: params.projectId,
        jobId: query.jobId
      });
      return { companyId, exports };
    } catch (error) {
      return reply.code(502).send({ message: "Could not load export jobs", detail: (error as Error).message });
    }
  });

  app.post("/projects/:projectId/exports/csv", async (request, reply) => {
    const params = request.params as { projectId: string };
    const companyId = resolveCompanyId(request);
    const parsed = exportJobSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid export payload", issues: parsed.error.flatten() });
    }

    try {
      const job = await queueProjectExportJob({
        companyId,
        projectId: params.projectId,
        jobId: parsed.data.jobId,
        type: "csv",
        details: "CSV export queued for JobTread-compatible budget format."
      });
      return { companyId, job };
    } catch (error) {
      return reply.code(502).send({ message: "Could not queue CSV export job", detail: (error as Error).message });
    }
  });

  app.post("/projects/:projectId/exports/jobtread-sync", async (request, reply) => {
    const params = request.params as { projectId: string };
    const companyId = resolveCompanyId(request);
    const parsed = exportJobSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid export payload", issues: parsed.error.flatten() });
    }

    try {
      const job = await queueProjectExportJob({
        companyId,
        projectId: params.projectId,
        jobId: parsed.data.jobId,
        type: "jobtread_sync",
        details: "Direct JobTread sync queued."
      });
      return { companyId, job };
    } catch (error) {
      return reply.code(502).send({ message: "Could not queue JobTread sync job", detail: (error as Error).message });
    }
  });
};

