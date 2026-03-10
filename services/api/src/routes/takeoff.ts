import type { FastifyPluginAsync } from "fastify";
import { getTakeoffSummaryForProject } from "../repositories/takeoff-repository.js";
import { resolveCompanyId } from "../utils/tenant.js";

export const takeoffRoutes: FastifyPluginAsync = async (app) => {
  app.get("/projects/:projectId/takeoff", async (request, reply) => {
    const params = request.params as { projectId: string };
    const query = request.query as { jobId?: string };
    const companyId = resolveCompanyId(request);

    try {
      const summary = await getTakeoffSummaryForProject({
        companyId,
        projectId: params.projectId,
        jobId: query.jobId
      });

      if (summary) {
        return { companyId, ...summary };
      }
      return reply.code(404).send({
        message: "No scanned room/symbol data found. Import and process plans before requesting takeoff."
      });
    } catch (error) {
      return reply.code(502).send({ message: "Could not load takeoff data", detail: (error as Error).message });
    }
  });
};

