import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  getFixtureById,
  searchByFixtureType,
  searchByLumens,
  searchByManufacturer,
  searchByWattage,
  searchFixtures
} from "../repositories/fixture-library-repository.js";
import { resolveCompanyId } from "../utils/tenant.js";

const searchSchema = z.object({
  q: z.string().optional(),
  fixtureType: z.string().optional(),
  manufacturer: z.string().optional(),
  lumensMin: z.coerce.number().nonnegative().optional(),
  lumensMax: z.coerce.number().nonnegative().optional(),
  wattageMin: z.coerce.number().nonnegative().optional(),
  wattageMax: z.coerce.number().nonnegative().optional(),
  voltage: z.string().optional(),
  mountingType: z.string().optional(),
  priceMin: z.coerce.number().nonnegative().optional(),
  priceMax: z.coerce.number().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(250).optional()
});

const rangeSchema = z.object({
  min: z.coerce.number().nonnegative().optional(),
  max: z.coerce.number().nonnegative().optional()
});

export const fixtureLibraryRoutes: FastifyPluginAsync = async (app) => {
  app.get("/fixtures", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const parsed = searchSchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid fixture search query", issues: parsed.error.flatten() });
    }

    const fixtures = await searchFixtures(companyId, parsed.data);
    return { companyId, fixtures };
  });

  app.get("/fixtures/search/manufacturer/:manufacturer", async (request) => {
    const companyId = resolveCompanyId(request);
    const params = request.params as { manufacturer: string };
    const fixtures = await searchByManufacturer(companyId, params.manufacturer);
    return { companyId, fixtures };
  });

  app.get("/fixtures/search/type/:fixtureType", async (request) => {
    const companyId = resolveCompanyId(request);
    const params = request.params as { fixtureType: string };
    const fixtures = await searchByFixtureType(companyId, params.fixtureType);
    return { companyId, fixtures };
  });

  app.get("/fixtures/search/lumens", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const parsed = rangeSchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid lumens range query", issues: parsed.error.flatten() });
    }

    const fixtures = await searchByLumens(companyId, parsed.data);
    return { companyId, fixtures };
  });

  app.get("/fixtures/search/wattage", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const parsed = rangeSchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid wattage range query", issues: parsed.error.flatten() });
    }

    const fixtures = await searchByWattage(companyId, parsed.data);
    return { companyId, fixtures };
  });

  app.get("/fixtures/:fixtureId", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const params = request.params as { fixtureId: string };
    const fixture = await getFixtureById(companyId, params.fixtureId);
    if (!fixture) {
      return reply.code(404).send({ message: "Fixture not found" });
    }
    return { companyId, fixture };
  });
};

