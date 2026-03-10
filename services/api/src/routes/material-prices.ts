import { monitorMaterialPrices } from "@package/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getCompanySettings } from "../repositories/company-settings-repository.js";
import {
  listMaterialPriceSnapshots,
  saveMaterialPriceSnapshot
} from "../repositories/material-price-repository.js";
import { listSupplierAccounts } from "../repositories/supplier-accounts-repository.js";
import { resolveCompanyId } from "../utils/tenant.js";

const inputSchema = z.object({
  jobId: z.string().min(1).optional(),
  source: z.enum(["manual", "scheduled_30_day"]).optional().default("manual")
});

function addDays(isoDate: string, days: number): string {
  const base = new Date(isoDate);
  base.setDate(base.getDate() + days);
  return base.toISOString();
}

function applyCompanyPricePreferences(
  prices: ReturnType<typeof monitorMaterialPrices>,
  options: {
    allowedSuppliers: Set<string>;
    preferredWireBrand: string | null;
    preferredDeviceBrand: string | null;
    preferredBreakerBrand: string | null;
  }
) {
  const bySupplier =
    options.allowedSuppliers.size === 0
      ? prices
      : prices.filter((price) => options.allowedSuppliers.has(price.supplier));

  return bySupplier.map((price) => {
    let brandOverride: string | null = null;
    if (price.item.toLowerCase().includes("thhn") || price.item.toLowerCase().includes("nm-b")) {
      brandOverride = options.preferredWireBrand;
    } else if (price.item.toLowerCase().includes("switch") || price.item.toLowerCase().includes("receptacle")) {
      brandOverride = options.preferredDeviceBrand;
    } else if (price.item.toLowerCase().includes("breaker")) {
      brandOverride = options.preferredBreakerBrand;
    }

    return brandOverride ? { ...price, brand: brandOverride } : price;
  });
}

export const materialPriceRoutes: FastifyPluginAsync = async (app) => {
  app.get("/projects/:projectId/material-prices", async (request, reply) => {
    const params = request.params as { projectId: string };
    const query = request.query as { jobId?: string };
    const companyId = resolveCompanyId(request);

    try {
      const snapshots = await listMaterialPriceSnapshots({
        companyId,
        projectId: params.projectId,
        jobId: query.jobId,
        limit: 12
      });

      const latest = snapshots[0] ?? null;
      return {
        companyId,
        projectId: params.projectId,
        latest,
        history: snapshots,
        nextDueAt: latest ? addDays(latest.createdAt, 30) : null
      };
    } catch (error) {
      return reply.code(502).send({ message: "Could not load material price snapshots", detail: (error as Error).message });
    }
  });

  app.post("/projects/:projectId/material-prices", async (request, reply) => {
    const params = request.params as { projectId: string };
    const companyId = resolveCompanyId(request);
    const parsed = inputSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid material prices payload", issues: parsed.error.flatten() });
    }

    try {
      const [settings, supplierAccounts] = await Promise.all([
        getCompanySettings(companyId),
        listSupplierAccounts(companyId)
      ]);
      const prices = applyCompanyPricePreferences(monitorMaterialPrices(), {
        allowedSuppliers: new Set(supplierAccounts.map((account) => account.supplierName)),
        preferredWireBrand: settings.preferredWireBrand,
        preferredDeviceBrand: settings.preferredDeviceBrand,
        preferredBreakerBrand: settings.preferredBreakerBrand
      });
      const persistence = await saveMaterialPriceSnapshot({
        companyId,
        projectId: params.projectId,
        jobId: parsed.data.jobId,
        source: parsed.data.source,
        prices
      });

      const snapshot = {
        snapshotId: persistence.snapshotId,
        createdAt: persistence.createdAt,
        source: parsed.data.source,
        prices
      };

      return {
        companyId,
        projectId: params.projectId,
        snapshot,
        nextDueAt: addDays(snapshot.createdAt, 30)
      };
    } catch (error) {
      return reply.code(502).send({ message: "Could not capture material price snapshot", detail: (error as Error).message });
    }
  });
};

