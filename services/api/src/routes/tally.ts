import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { generateEstimate } from "@package/shared";
import { getCompanySettings } from "../repositories/company-settings-repository.js";
import {
  addTallyDelta,
  getTallyList,
  isSupportedTallyDeviceType,
  setTallyQuantity
} from "../repositories/tally-repository.js";
import { resolveCompanyId } from "../utils/tenant.js";

const getSchema = z.object({
  projectId: z.string().min(1),
  jobId: z.string().min(1).optional()
});

const updateSchema = z.object({
  projectId: z.string().min(1),
  jobId: z.string().min(1).optional(),
  device: z.string().min(1),
  quantity: z.number().int().nonnegative()
});

const addSchema = z.object({
  projectId: z.string().min(1),
  jobId: z.string().min(1).optional(),
  device: z.string().min(1),
  delta: z.number().int()
});

function buildEstimateTotalsFromTally(
  tallyList: Array<{ device: string; quantity: number }>,
  settings: {
    defaultLaborRate: number;
    defaultLaborHoursPerPoint: number;
    laborBurdenPercentage: number;
    defaultPricePerPoint: number;
    materialMarkupPercentage: number;
    overheadPercentage: number;
    profitMarginPercentage: number;
    defaultCostPerSquareFoot: number;
  }
) {
  const receptacles =
    (tallyList.find((item) => item.device === "Duplex Receptacle")?.quantity ?? 0) +
    (tallyList.find((item) => item.device === "GFCI Receptacle")?.quantity ?? 0);
  const switches =
    (tallyList.find((item) => item.device === "Switch")?.quantity ?? 0) +
    (tallyList.find((item) => item.device === "3-way Switch")?.quantity ?? 0) +
    (tallyList.find((item) => item.device === "4-way Switch")?.quantity ?? 0);
  const lights =
    (tallyList.find((item) => item.device === "Lighting Fixture")?.quantity ?? 0) +
    (tallyList.find((item) => item.device === "Exit Sign")?.quantity ?? 0) +
    (tallyList.find((item) => item.device === "Emergency Light")?.quantity ?? 0);
  const dataPorts = tallyList.find((item) => item.device === "Data Port")?.quantity ?? 0;
  const lowVoltage = tallyList.find((item) => item.device === "Speaker")?.quantity ?? 0;

  const totalPoints = receptacles + switches + lights + dataPorts + lowVoltage;
  const inferredSquareFeet =
    settings.defaultCostPerSquareFoot > 0
      ? Math.max(1, Math.round((settings.defaultPricePerPoint * totalPoints) / settings.defaultCostPerSquareFoot))
      : Math.max(1, totalPoints * 30);

  const laborCostPerPoint = Number(
    (
      settings.defaultLaborRate *
      settings.defaultLaborHoursPerPoint *
      (1 + settings.laborBurdenPercentage / 100)
    ).toFixed(2)
  );
  const materialCostPerPoint = Number((settings.defaultPricePerPoint - laborCostPerPoint).toFixed(2));
  const markupMultiplier = Number(
    (
      1 +
      (settings.materialMarkupPercentage + settings.overheadPercentage + settings.profitMarginPercentage) / 100
    ).toFixed(4)
  );

  if (materialCostPerPoint <= 0) {
    return null;
  }

  return generateEstimate({
    laborCostPerPoint,
    materialCostPerPoint,
    markupMultiplier,
    points: {
      receptacles,
      switches,
      lights,
      dataPorts,
      lowVoltage
    },
    baseLaborHoursPerPoint: settings.defaultLaborHoursPerPoint,
    squareFeet: inferredSquareFeet,
    finishLevel: "builder_grade"
  });
}

export const tallyRoutes: FastifyPluginAsync = async (app) => {
  app.get("/tally", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const parsed = getSchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid tally query", issues: parsed.error.flatten() });
    }

    try {
      const tally = await getTallyList({
        companyId,
        projectId: parsed.data.projectId,
        jobId: parsed.data.jobId
      });
      const settings = await getCompanySettings(companyId);
      const estimateTotals = buildEstimateTotalsFromTally(tally.tally_list, settings);
      return {
        companyId,
        projectId: parsed.data.projectId,
        jobId: parsed.data.jobId ?? null,
        ...tally,
        estimateTotals
      };
    } catch (error) {
      return reply.code(502).send({ message: "Could not load tally list", detail: (error as Error).message });
    }
  });

  app.post("/tally/update", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const parsed = updateSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid tally update payload", issues: parsed.error.flatten() });
    }
    if (!isSupportedTallyDeviceType(parsed.data.device)) {
      return reply.code(400).send({ message: "Unsupported device type for tally update." });
    }

    try {
      await setTallyQuantity({
        companyId,
        projectId: parsed.data.projectId,
        jobId: parsed.data.jobId,
        deviceType: parsed.data.device,
        quantity: parsed.data.quantity
      });
      const tally = await getTallyList({
        companyId,
        projectId: parsed.data.projectId,
        jobId: parsed.data.jobId
      });
      const settings = await getCompanySettings(companyId);
      const estimateTotals = buildEstimateTotalsFromTally(tally.tally_list, settings);
      return {
        companyId,
        projectId: parsed.data.projectId,
        jobId: parsed.data.jobId ?? null,
        ...tally,
        estimateTotals
      };
    } catch (error) {
      return reply.code(502).send({ message: "Could not update tally list", detail: (error as Error).message });
    }
  });

  app.post("/tally/add", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const parsed = addSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid tally add payload", issues: parsed.error.flatten() });
    }
    if (!isSupportedTallyDeviceType(parsed.data.device)) {
      return reply.code(400).send({ message: "Unsupported device type for tally add." });
    }

    try {
      await addTallyDelta({
        companyId,
        projectId: parsed.data.projectId,
        jobId: parsed.data.jobId,
        deviceType: parsed.data.device,
        delta: parsed.data.delta
      });
      const tally = await getTallyList({
        companyId,
        projectId: parsed.data.projectId,
        jobId: parsed.data.jobId
      });
      const settings = await getCompanySettings(companyId);
      const estimateTotals = buildEstimateTotalsFromTally(tally.tally_list, settings);
      return {
        companyId,
        projectId: parsed.data.projectId,
        jobId: parsed.data.jobId ?? null,
        ...tally,
        estimateTotals
      };
    } catch (error) {
      return reply.code(502).send({ message: "Could not add tally adjustment", detail: (error as Error).message });
    }
  });
};
