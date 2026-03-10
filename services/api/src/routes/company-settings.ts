import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  getCompanySettings,
  updateCompanySettings
} from "../repositories/company-settings-repository.js";
import {
  listSupplierAccounts,
  upsertSupplierAccount
} from "../repositories/supplier-accounts-repository.js";
import { resolveCompanyId } from "../utils/tenant.js";

const companySettingsUpdateSchema = z.object({
  defaultLaborRate: z.number().positive().optional(),
  apprenticeLaborRate: z.number().positive().optional(),
  laborBurdenPercentage: z.number().min(0).max(500).optional(),
  materialMarkupPercentage: z.number().min(0).max(500).optional(),
  overheadPercentage: z.number().min(0).max(500).optional(),
  profitMarginPercentage: z.number().min(0).max(500).optional(),
  preferredWireBrand: z.string().min(1).max(120).nullable().optional(),
  preferredDeviceBrand: z.string().min(1).max(120).nullable().optional(),
  preferredBreakerBrand: z.string().min(1).max(120).nullable().optional(),
  defaultUtilityProvider: z.enum(["Central Hudson", "NYSEG"]).optional(),
  defaultVoltageSystem: z.enum(["120/240", "120/208", "277/480"]).optional(),
  defaultPricePerPoint: z.number().positive().optional(),
  defaultCostPerSquareFoot: z.number().positive().optional(),
  defaultLaborHoursPerPoint: z.number().positive().optional(),
  defaultCrewSize: z.number().int().positive().max(100).optional(),
  loadCalculationMethod: z.enum(["NEC Standard Method", "NEC Optional Method"]).optional()
});

const supplierUpsertSchema = z.object({
  supplierName: z.enum(["Home Depot Pro", "Copper Electric Supply", "HZ Electric Supply"]),
  username: z.string().min(1).max(180).nullable().optional(),
  encryptedPassword: z.string().min(1).max(1200).nullable().optional(),
  apiToken: z.string().min(1).max(2400).nullable().optional(),
  lastLogin: z.string().datetime().nullable().optional()
});

export const companySettingsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/company/settings", async (request, reply) => {
    const companyId = resolveCompanyId(request);

    try {
      const settings = await getCompanySettings(companyId);
      return { companyId, settings };
    } catch (error) {
      return reply.code(502).send({ message: "Could not load company settings", detail: (error as Error).message });
    }
  });

  app.put("/company/settings", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const parsed = companySettingsUpdateSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid company settings payload", issues: parsed.error.flatten() });
    }

    try {
      const settings = await updateCompanySettings(companyId, parsed.data);
      return { companyId, settings };
    } catch (error) {
      return reply.code(502).send({ message: "Could not update company settings", detail: (error as Error).message });
    }
  });

  app.get("/company/supplier-accounts", async (request, reply) => {
    const companyId = resolveCompanyId(request);

    try {
      const supplierAccounts = await listSupplierAccounts(companyId);
      return { companyId, supplierAccounts };
    } catch (error) {
      return reply.code(502).send({ message: "Could not load supplier accounts", detail: (error as Error).message });
    }
  });

  app.post("/company/supplier-accounts", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const parsed = supplierUpsertSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid supplier account payload", issues: parsed.error.flatten() });
    }

    try {
      const supplierAccount = await upsertSupplierAccount(companyId, parsed.data);
      return { companyId, supplierAccount };
    } catch (error) {
      return reply.code(502).send({ message: "Could not save supplier account", detail: (error as Error).message });
    }
  });
};
