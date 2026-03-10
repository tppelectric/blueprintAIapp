import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { confirmProjectSymbol, listProjectReviewQueue } from "../repositories/symbol-review-repository.js";
import { resolveCompanyId } from "../utils/tenant.js";

const decisionSchema = z.object({
  jobId: z.string().min(1).optional(),
  detectionId: z.string().min(1),
  confirmedType: z.enum([
    "outlet",
    "switch",
    "dimmer",
    "light",
    "recessed_light",
    "fan",
    "cat6",
    "speaker",
    "camera",
    "smoke_co"
  ])
});

export const symbolRoutes: FastifyPluginAsync = async (app) => {
  app.get("/projects/:projectId/symbol-review", async (request, reply) => {
    const params = request.params as { projectId: string };
    const query = request.query as { jobId?: string };
    const companyId = resolveCompanyId(request);

    try {
      const queue = await listProjectReviewQueue({
        companyId,
        projectId: params.projectId,
        jobId: query.jobId
      });
      return { companyId, queue };
    } catch (error) {
      return reply.code(502).send({ message: "Could not load symbol review queue", detail: (error as Error).message });
    }
  });

  app.post("/projects/:projectId/symbol-review/confirm", async (request, reply) => {
    const params = request.params as { projectId: string };
    const companyId = resolveCompanyId(request);
    const parsed = decisionSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid review payload", issues: parsed.error.flatten() });
    }

    try {
      const symbol = await confirmProjectSymbol({
        companyId,
        projectId: params.projectId,
        jobId: parsed.data.jobId,
        detectionId: parsed.data.detectionId,
        confirmedType: parsed.data.confirmedType
      });

      if (!symbol) {
        return reply.code(404).send({ message: "Symbol detection not found for this project." });
      }

      return { companyId, symbol };
    } catch (error) {
      return reply.code(502).send({ message: "Could not confirm symbol", detail: (error as Error).message });
    }
  });
};

