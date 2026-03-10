import { estimateDedicatedCircuits, generatePanelSchedule } from "@package/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  getLatestProjectPanelSchedule,
  saveProjectPanelSchedule
} from "../repositories/panel-schedule-repository.js";
import { resolveCompanyId } from "../utils/tenant.js";

const inputSchema = z.object({
  jobId: z.string().min(1).optional(),
  includeDefaults: z.boolean().optional().default(true)
});

export const panelScheduleRoutes: FastifyPluginAsync = async (app) => {
  app.get("/projects/:projectId/panel-schedule", async (request, reply) => {
    const params = request.params as { projectId: string };
    const query = request.query as { jobId?: string };
    const companyId = resolveCompanyId(request);

    try {
      const latest = await getLatestProjectPanelSchedule({
        companyId,
        projectId: params.projectId,
        jobId: query.jobId
      });

      if (!latest) {
        return reply.code(404).send({ message: "No saved panel schedule found for this project." });
      }

      return { companyId, projectId: params.projectId, panelSchedule: latest };
    } catch (error) {
      return reply.code(502).send({ message: "Could not load panel schedule", detail: (error as Error).message });
    }
  });

  app.post("/projects/:projectId/panel-schedule", async (request, reply) => {
    const params = request.params as { projectId: string };
    const companyId = resolveCompanyId(request);
    const parsed = inputSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid panel schedule payload", issues: parsed.error.flatten() });
    }

    try {
      const circuits = parsed.data.includeDefaults ? estimateDedicatedCircuits() : [];
      const rows = generatePanelSchedule(circuits);
      const persistence = await saveProjectPanelSchedule({
        companyId,
        projectId: params.projectId,
        jobId: parsed.data.jobId,
        sourceCircuits: circuits,
        rows
      });

      return {
        companyId,
        projectId: params.projectId,
        panelSchedule: {
          scheduleId: persistence.scheduleId,
          createdAt: persistence.createdAt,
          sourceCircuits: circuits,
          rows
        }
      };
    } catch (error) {
      return reply.code(502).send({ message: "Could not generate panel schedule", detail: (error as Error).message });
    }
  });
};

