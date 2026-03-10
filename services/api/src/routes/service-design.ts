import { designUtilityService, recommendServiceSize } from "@package/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getCompanySettings } from "../repositories/company-settings-repository.js";
import {
  getLatestProjectServiceDesign,
  saveProjectServiceDesign
} from "../repositories/service-design-repository.js";
import { resolveCompanyId } from "../utils/tenant.js";

const inputSchema = z.object({
  jobId: z.string().min(1).optional(),
  provider: z.enum(["central_hudson", "nyseg"]).optional(),
  serviceAmps: z.number().positive(),
  continuousLoadAmps: z.number().positive().optional(),
  installationType: z.enum(["overhead", "underground"])
});

function mapDefaultUtilityProvider(value: "Central Hudson" | "NYSEG"): "central_hudson" | "nyseg" {
  return value === "NYSEG" ? "nyseg" : "central_hudson";
}

export const serviceDesignRoutes: FastifyPluginAsync = async (app) => {
  app.get("/projects/:projectId/service-design", async (request, reply) => {
    const params = request.params as { projectId: string };
    const query = request.query as { jobId?: string };
    const companyId = resolveCompanyId(request);

    try {
      const latest = await getLatestProjectServiceDesign({
        companyId,
        projectId: params.projectId,
        jobId: query.jobId
      });

      if (!latest) {
        return reply.code(404).send({ message: "No saved service design found for this project." });
      }

      return { companyId, projectId: params.projectId, serviceDesign: latest };
    } catch (error) {
      return reply.code(502).send({ message: "Could not load service design", detail: (error as Error).message });
    }
  });

  app.post("/projects/:projectId/service-design", async (request, reply) => {
    const params = request.params as { projectId: string };
    const companyId = resolveCompanyId(request);
    const parsed = inputSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid service design payload", issues: parsed.error.flatten() });
    }

    try {
      const companySettings = await getCompanySettings(companyId);
      const provider = parsed.data.provider ?? mapDefaultUtilityProvider(companySettings.defaultUtilityProvider);
      const { serviceAmps, continuousLoadAmps, installationType } = parsed.data;

      let serviceSize = recommendServiceSize(serviceAmps);
      // Central Hudson explicit rule provided by user context.
      if (provider === "central_hudson" && continuousLoadAmps && continuousLoadAmps > 320) {
        serviceSize = "CT metering";
      }

      const design = designUtilityService(provider, serviceSize, installationType);
      const persistence = await saveProjectServiceDesign({
        companyId,
        projectId: params.projectId,
        jobId: parsed.data.jobId,
        provider,
        serviceAmps,
        continuousLoadAmps,
        installationType,
        serviceSize,
        design
      });

      return {
        companyId,
        projectId: params.projectId,
        serviceDesign: {
          designId: persistence.designId,
          createdAt: persistence.createdAt,
          provider,
          serviceAmps,
          continuousLoadAmps,
          installationType,
          serviceSize,
          design
        }
      };
    } catch (error) {
      return reply.code(502).send({ message: "Could not generate service design", detail: (error as Error).message });
    }
  });
};

