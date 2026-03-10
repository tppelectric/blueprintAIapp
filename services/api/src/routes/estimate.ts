import { generateEstimate } from "@package/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getCompanySettings } from "../repositories/company-settings-repository.js";
import {
  getLatestProjectEstimate,
  listProjectEstimateMetrics,
  saveProjectEstimate
} from "../repositories/estimate-repository.js";
import { getTakeoffSummaryForProject } from "../repositories/takeoff-repository.js";
import { resolveCompanyId } from "../utils/tenant.js";
import { getDbPool } from "../db/postgres.js";

const estimateInputSchema = z.object({
  jobId: z.string().min(1).optional(),
  laborCostPerPoint: z.number().positive().optional(),
  materialCostPerPoint: z.number().positive().optional(),
  markupMultiplier: z.number().positive().optional(),
  baseLaborHoursPerPoint: z.number().positive().optional(),
  finishLevel: z.enum(["builder_grade", "mid_range_residential", "high_end_residential"]).optional().default("mid_range_residential")
});

function sumPointsFromTakeoffs(
  takeoffs: Array<{
    counts: {
      outlet: number;
      switch: number;
      dimmer: number;
      light: number;
      recessed_light: number;
      fan: number;
      cat6: number;
      speaker: number;
      camera: number;
      smoke_co: number;
    };
  }>
) {
  return takeoffs.reduce(
    (acc, row) => {
      acc.receptacles += row.counts.outlet;
      acc.switches += row.counts.switch + row.counts.dimmer;
      acc.lights += row.counts.light + row.counts.recessed_light + row.counts.fan;
      acc.dataPorts += row.counts.cat6;
      acc.lowVoltage += row.counts.speaker + row.counts.camera;
      return acc;
    },
    {
      receptacles: 0,
      switches: 0,
      lights: 0,
      dataPorts: 0,
      lowVoltage: 0
    }
  );
}

export const estimateRoutes: FastifyPluginAsync = async (app) => {
  app.get("/projects/:projectId/estimate/metrics", async (request, reply) => {
    const params = request.params as { projectId: string };
    const query = request.query as { jobId?: string };
    const companyId = resolveCompanyId(request);

    try {
      const metrics = await listProjectEstimateMetrics({
        companyId,
        projectId: params.projectId,
        jobId: query.jobId,
        limit: 24
      });

      return { companyId, projectId: params.projectId, ...metrics };
    } catch (error) {
      return reply.code(502).send({ message: "Could not load estimate metrics", detail: (error as Error).message });
    }
  });

  app.get("/projects/:projectId/estimate", async (request, reply) => {
    const params = request.params as { projectId: string };
    const query = request.query as { jobId?: string };
    const companyId = resolveCompanyId(request);

    try {
      const latest = await getLatestProjectEstimate({
        companyId,
        projectId: params.projectId,
        jobId: query.jobId
      });

      if (!latest) {
        return reply.code(404).send({ message: "No saved estimate found for this project." });
      }

      return { companyId, ...latest };
    } catch (error) {
      return reply.code(502).send({ message: "Could not load project estimate", detail: (error as Error).message });
    }
  });

  app.post("/projects/:projectId/estimate", async (request, reply) => {
    const params = request.params as { projectId: string };
    const companyId = resolveCompanyId(request);
    const parsed = estimateInputSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid estimate payload", issues: parsed.error.flatten() });
    }

    const pricingInput = parsed.data;

    try {
      const companySettings = await getCompanySettings(companyId);
      let takeoffs: Array<{
        counts: {
          outlet: number;
          switch: number;
          dimmer: number;
          light: number;
          recessed_light: number;
          fan: number;
          cat6: number;
          speaker: number;
          camera: number;
          smoke_co: number;
        };
      }> = [];
      let squareFeet = 0;

      const summary = await getTakeoffSummaryForProject({
        companyId,
        projectId: params.projectId,
        jobId: pricingInput.jobId
      });

      if (!summary) {
        return reply.code(409).send({
          message: "No scanned room/symbol data found. Import and process plans before generating an estimate."
        });
      }
      takeoffs = summary.takeoffs;

      const pool = getDbPool();
      const roomAreaResult = await pool.query<{ area_total: number }>(
        `
        SELECT COALESCE(SUM(area_sq_ft), 0) AS area_total
        FROM project_rooms
        WHERE company_id = $1
          AND project_id = $2
          AND ($3::text IS NULL OR job_id = $3)
        `,
        [companyId, params.projectId, pricingInput.jobId ?? null]
      );
      squareFeet = Number(roomAreaResult.rows[0]?.area_total ?? 0);

      const points = sumPointsFromTakeoffs(takeoffs);
      const derivedLaborCostPerPoint =
        pricingInput.laborCostPerPoint ??
        Number(
          (
            companySettings.defaultLaborRate *
            companySettings.defaultLaborHoursPerPoint *
            (1 + companySettings.laborBurdenPercentage / 100)
          ).toFixed(2)
        );

      const derivedMarkupMultiplier =
        pricingInput.markupMultiplier ??
        Number(
          (
            1 +
            (companySettings.materialMarkupPercentage +
              companySettings.overheadPercentage +
              companySettings.profitMarginPercentage) /
              100
          ).toFixed(4)
        );

      const derivedMaterialCostPerPoint =
        pricingInput.materialCostPerPoint ??
        Number((companySettings.defaultPricePerPoint - derivedLaborCostPerPoint).toFixed(2));

      if (derivedMaterialCostPerPoint <= 0) {
        return reply.code(409).send({
          message:
            "Company settings are incomplete for estimating. Update Company Settings so default_price_per_point is higher than labor cost per point."
        });
      }

      const pricing = {
        laborCostPerPoint: derivedLaborCostPerPoint,
        materialCostPerPoint: derivedMaterialCostPerPoint,
        markupMultiplier: derivedMarkupMultiplier,
        baseLaborHoursPerPoint:
          pricingInput.baseLaborHoursPerPoint ?? companySettings.defaultLaborHoursPerPoint,
        finishLevel: pricingInput.finishLevel,
        squareFeet: squareFeet > 0 ? squareFeet : 1
      };

      const estimate = generateEstimate({
        ...pricing,
        points
      });

      const persistence = await saveProjectEstimate({
        companyId,
        projectId: params.projectId,
        jobId: pricingInput.jobId,
        points,
        pricing,
        estimate
      });

      return {
        companyId,
        projectId: params.projectId,
        estimateId: persistence.estimateId,
        createdAt: persistence.createdAt,
        points,
        pricing,
        estimate
      };
    } catch (error) {
      return reply.code(502).send({ message: "Could not generate project estimate", detail: (error as Error).message });
    }
  });
};

