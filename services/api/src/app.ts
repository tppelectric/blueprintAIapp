import cors from "@fastify/cors";
import Fastify from "fastify";
import { blueprintProcessingRoutes } from "./routes/blueprint-processing.js";
import { companySettingsRoutes } from "./routes/company-settings.js";
import { complianceRoutes } from "./routes/compliance.js";
import { estimateRoutes } from "./routes/estimate.js";
import { exportRoutes } from "./routes/exports.js";
import { fixtureLibraryRoutes } from "./routes/fixture-library.js";
import { healthRoutes } from "./routes/health.js";
import { importRoutes } from "./routes/import.js";
import { materialListRoutes } from "./routes/material-list.js";
import { materialPriceRoutes } from "./routes/material-prices.js";
import { panelScheduleRoutes } from "./routes/panel-schedule.js";
import { platformRoutes } from "./routes/platform.js";
import { projectRoutes } from "./routes/projects.js";
import { authRoutes } from "./routes/auth.js";
import { serviceDesignRoutes } from "./routes/service-design.js";
import { scanJobRoutes } from "./routes/scan-jobs.js";
import { symbolRoutes } from "./routes/symbols.js";
import { tallyRoutes } from "./routes/tally.js";
import { takeoffRoutes } from "./routes/takeoff.js";
import { enforceAuthContext } from "./utils/auth.js";
import { enforceRolePermissions } from "./utils/rbac.js";

function getAllowedOrigins(): string[] {
  const configured = process.env.CORS_ALLOWED_ORIGINS ?? process.env.WEB_URL ?? "";
  return configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }

  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.length === 0) {
    return process.env.NODE_ENV !== "production";
  }

  return allowedOrigins.includes(origin);
}

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS"), false);
    }
  });

  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/api")) {
      return;
    }

    const path = request.url.split("?")[0];
    const publicAuthRoutes = new Set([
      "POST /api/auth/login",
      "POST /api/auth/onboard-admin",
      "POST /api/auth/password-reset/request",
      "POST /api/auth/password-reset/confirm"
    ]);
    if (publicAuthRoutes.has(`${request.method.toUpperCase()} ${path}`)) {
      return;
    }

    const allowed = await enforceAuthContext(request, reply);
    if (!allowed) {
      return reply;
    }

    const roleAllowed = await enforceRolePermissions(request, reply);
    if (!roleAllowed) {
      return reply;
    }
  });

  await app.register(healthRoutes, { prefix: "/health" });
  await app.register(projectRoutes, { prefix: "/api" });
  await app.register(importRoutes, { prefix: "/api" });
  await app.register(symbolRoutes, { prefix: "/api" });
  await app.register(takeoffRoutes, { prefix: "/api" });
  await app.register(estimateRoutes, { prefix: "/api" });
  await app.register(panelScheduleRoutes, { prefix: "/api" });
  await app.register(serviceDesignRoutes, { prefix: "/api" });
  await app.register(scanJobRoutes, { prefix: "/api" });
  await app.register(materialListRoutes, { prefix: "/api" });
  await app.register(materialPriceRoutes, { prefix: "/api" });
  await app.register(exportRoutes, { prefix: "/api" });
  await app.register(platformRoutes, { prefix: "/api" });
  await app.register(authRoutes, { prefix: "/api" });
  await app.register(blueprintProcessingRoutes, { prefix: "/api" });
  await app.register(companySettingsRoutes, { prefix: "/api" });
  await app.register(complianceRoutes, { prefix: "/api" });
  await app.register(tallyRoutes, { prefix: "/api" });
  await app.register(fixtureLibraryRoutes, { prefix: "/api" });

  return app;
}
