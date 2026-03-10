import type { FastifyPluginAsync } from "fastify";
import { getDbSchemaStatus } from "../db/schema-guard.js";
import { getPrimaryCompanyId, getTenancyMode } from "../utils/tenant.js";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    return {
      status: "ok",
      service: "api",
      tenancyMode: getTenancyMode(),
      primaryCompanyId: getPrimaryCompanyId(),
      authRequired: process.env.APP_TENANCY_MODE === "multi_company" || process.env.AUTH_REQUIRED === "true",
      devTenantHeaderEnabled: process.env.ALLOW_DEV_TENANT_HEADER === "true",
      timestamp: new Date().toISOString()
    };
  });

  app.get("/schema", async (request, reply) => {
    try {
      const schema = await getDbSchemaStatus();
      return {
        status: schema.ok ? "ok" : "error",
        service: "api",
        schema
      };
    } catch (error) {
      return reply.code(502).send({
        status: "error",
        service: "api",
        message: "Could not evaluate database schema status.",
        detail: (error as Error).message
      });
    }
  });
};

