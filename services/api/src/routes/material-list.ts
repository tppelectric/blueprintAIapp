import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getCompanySettings } from "../repositories/company-settings-repository.js";
import {
  getLatestProjectMaterialList,
  saveProjectMaterialList
} from "../repositories/material-list-repository.js";
import { getTallyList } from "../repositories/tally-repository.js";
import { generateStagedMaterialLists } from "../services/staged-material-generator.js";
import { getTakeoffSummaryForProject } from "../repositories/takeoff-repository.js";
import { resolveCompanyId } from "../utils/tenant.js";

const inputSchema = z.object({
  jobId: z.string().min(1).optional()
});

const stagedInputSchema = z.object({
  jobId: z.string().min(1).optional(),
  conduitLengthsFeet: z.number().nonnegative(),
  wireLengthsFeet: z.number().nonnegative(),
  panelCounts: z.number().int().nonnegative()
});

function applyCompanyMaterialPreferences(
  items: Array<{
    id: string;
    projectId: string;
    itemCode: string;
    description: string;
    brand?: string;
    unit: string;
    quantity: number;
  }>,
  settings: {
    preferredWireBrand: string | null;
    preferredDeviceBrand: string | null;
    preferredBreakerBrand: string | null;
  }
) {
  return items.map((item) => {
    let preferredBrand: string | null = null;
    if (item.itemCode.startsWith("WIRE-")) {
      preferredBrand = settings.preferredWireBrand;
    } else if (item.itemCode.startsWith("DEV-")) {
      preferredBrand = settings.preferredDeviceBrand;
    } else if (item.itemCode.includes("BREAKER")) {
      preferredBrand = settings.preferredBreakerBrand;
    }

    if (!preferredBrand) {
      return item;
    }

    return {
      ...item,
      brand: preferredBrand
    };
  });
}

export const materialListRoutes: FastifyPluginAsync = async (app) => {
  app.get("/projects/:projectId/material-list", async (request, reply) => {
    const params = request.params as { projectId: string };
    const query = request.query as { jobId?: string };
    const companyId = resolveCompanyId(request);

    try {
      const latest = await getLatestProjectMaterialList({
        companyId,
        projectId: params.projectId,
        jobId: query.jobId
      });

      if (!latest) {
        return reply.code(404).send({ message: "No saved material list found for this project." });
      }

      return { companyId, projectId: params.projectId, materialList: latest };
    } catch (error) {
      return reply.code(502).send({ message: "Could not load material list", detail: (error as Error).message });
    }
  });

  app.post("/projects/:projectId/material-list", async (request, reply) => {
    const params = request.params as { projectId: string };
    const companyId = resolveCompanyId(request);
    const parsed = inputSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid material list payload", issues: parsed.error.flatten() });
    }

    try {
      const settings = await getCompanySettings(companyId);
      const summary = await getTakeoffSummaryForProject({
        companyId,
        projectId: params.projectId,
        jobId: parsed.data.jobId
      });
      if (!summary || summary.materials.length === 0) {
        return reply.code(409).send({
          message: "No takeoff-derived materials found. Import and process plans before generating a material list."
        });
      }
      const source = "takeoff";
      const items = applyCompanyMaterialPreferences(summary.materials, settings);

      const persistence = await saveProjectMaterialList({
        companyId,
        projectId: params.projectId,
        jobId: parsed.data.jobId,
        source,
        items
      });

      return {
        companyId,
        projectId: params.projectId,
        materialList: {
          listId: persistence.listId,
          createdAt: persistence.createdAt,
          source,
          items
        }
      };
    } catch (error) {
      return reply.code(502).send({ message: "Could not generate material list", detail: (error as Error).message });
    }
  });

  app.post("/projects/:projectId/material-list/staged", async (request, reply) => {
    const params = request.params as { projectId: string };
    const companyId = resolveCompanyId(request);
    const parsed = stagedInputSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid staged material payload", issues: parsed.error.flatten() });
    }

    try {
      const tally = await getTallyList({
        companyId,
        projectId: params.projectId,
        jobId: parsed.data.jobId
      });

      const staged = generateStagedMaterialLists({
        tallyList: tally.tally_list,
        conduitLengthsFeet: parsed.data.conduitLengthsFeet,
        wireLengthsFeet: parsed.data.wireLengthsFeet,
        panelCounts: parsed.data.panelCounts
      });

      return {
        companyId,
        projectId: params.projectId,
        jobId: parsed.data.jobId ?? null,
        ...staged
      };
    } catch (error) {
      return reply.code(502).send({
        message: "Could not generate staged material list",
        detail: (error as Error).message
      });
    }
  });
};

