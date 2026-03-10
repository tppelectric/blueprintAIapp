import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { buildApp } from "./app.js";

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const headerPart = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadPart = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const unsigned = `${headerPart}.${payloadPart}`;
  const signature = createHmac("sha256", secret).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

test("returns 401 for /api routes when strict auth is enabled and token missing", async () => {
  process.env.APP_TENANCY_MODE = "multi_company";
  process.env.AUTH_REQUIRED = "true";
  process.env.JWT_SECRET = "test-secret";

  const app = await buildApp();
  await app.ready();

  const response = await app.inject({
    method: "GET",
    url: "/api/platform/dashboard"
  });

  assert.equal(response.statusCode, 401);
  await app.close();
});

test("allows /api routes with a valid JWT in strict mode", async () => {
  process.env.APP_TENANCY_MODE = "multi_company";
  process.env.AUTH_REQUIRED = "true";
  process.env.RBAC_ENFORCED = "false";
  process.env.JWT_SECRET = "test-secret";

  const token = signJwt(
    {
      sub: "user-1",
      company_id: "company-primary",
      role: "admin",
      exp: Math.floor(Date.now() / 1000) + 3600
    },
    process.env.JWT_SECRET
  );

  const app = await buildApp();
  await app.ready();

  const response = await app.inject({
    method: "GET",
    url: "/api/platform/compliance-report",
    headers: {
      authorization: `Bearer ${token}`
    }
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json() as { companyId?: string };
  assert.equal(payload.companyId, "company-primary");
  await app.close();
});

test("blocks viewer role from estimator write routes when RBAC is enabled", async () => {
  process.env.APP_TENANCY_MODE = "multi_company";
  process.env.AUTH_REQUIRED = "true";
  process.env.RBAC_ENFORCED = "true";
  process.env.JWT_SECRET = "test-secret";

  const token = signJwt(
    {
      sub: "user-viewer",
      company_id: "company-primary",
      role: "viewer",
      exp: Math.floor(Date.now() / 1000) + 3600
    },
    process.env.JWT_SECRET
  );

  const app = await buildApp();
  await app.ready();

  const response = await app.inject({
    method: "POST",
    url: "/api/platform/estimate",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    payload: {
      laborCostPerPoint: 50,
      materialCostPerPoint: 40,
      markupMultiplier: 1.1,
      points: {
        receptacles: 1,
        switches: 1,
        lights: 1,
        dataPorts: 0,
        lowVoltage: 0
      },
      baseLaborHoursPerPoint: 0.4,
      squareFeet: 1000,
      finishLevel: "builder_grade"
    }
  });

  assert.equal(response.statusCode, 403);
  await app.close();
});

test("blocks non-admin role from JobTread sync route when RBAC is enabled", async () => {
  process.env.APP_TENANCY_MODE = "multi_company";
  process.env.AUTH_REQUIRED = "true";
  process.env.RBAC_ENFORCED = "true";
  process.env.JWT_SECRET = "test-secret";

  const token = signJwt(
    {
      sub: "user-estimator",
      company_id: "company-primary",
      role: "estimator",
      exp: Math.floor(Date.now() / 1000) + 3600
    },
    process.env.JWT_SECRET
  );

  const app = await buildApp();
  await app.ready();

  const response = await app.inject({
    method: "POST",
    url: "/api/projects/p-001/exports/jobtread-sync",
    headers: {
      authorization: `Bearer ${token}`
    }
  });

  assert.equal(response.statusCode, 403);
  await app.close();
});
