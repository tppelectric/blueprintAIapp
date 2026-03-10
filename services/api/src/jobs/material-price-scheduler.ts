import { monitorMaterialPrices } from "@package/shared";
import { getCompanySettings } from "../repositories/company-settings-repository.js";
import {
  listProjectsDueForMaterialPriceSnapshots,
  saveMaterialPriceSnapshot
} from "../repositories/material-price-repository.js";
import { listSupplierAccounts } from "../repositories/supplier-accounts-repository.js";

type SchedulerLogger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

function schedulerEnabled(): boolean {
  return process.env.MATERIAL_PRICE_SCHEDULER_ENABLED === "true";
}

function schedulerIntervalMs(): number {
  const configured = Number(process.env.MATERIAL_PRICE_SCHEDULER_INTERVAL_MS ?? 3_600_000);
  return Number.isFinite(configured) && configured >= 60_000 ? configured : 3_600_000;
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

async function runSchedulerCycle(log: SchedulerLogger): Promise<void> {
  const dueProjects = await listProjectsDueForMaterialPriceSnapshots(50);
  if (dueProjects.length === 0) {
    log.info("Material price scheduler: no projects due.");
    return;
  }

  for (const project of dueProjects) {
    const [settings, supplierAccounts] = await Promise.all([
      getCompanySettings(project.companyId),
      listSupplierAccounts(project.companyId)
    ]);
    const prices = applyCompanyPricePreferences(monitorMaterialPrices(), {
      allowedSuppliers: new Set(supplierAccounts.map((account) => account.supplierName)),
      preferredWireBrand: settings.preferredWireBrand,
      preferredDeviceBrand: settings.preferredDeviceBrand,
      preferredBreakerBrand: settings.preferredBreakerBrand
    });
    await saveMaterialPriceSnapshot({
      companyId: project.companyId,
      projectId: project.projectId,
      source: "scheduled_30_day",
      prices
    });
  }

  log.info(`Material price scheduler: captured snapshots for ${dueProjects.length} project(s).`);
}

export function startMaterialPriceScheduler(log: SchedulerLogger): void {
  if (!schedulerEnabled()) {
    log.info("Material price scheduler disabled (MATERIAL_PRICE_SCHEDULER_ENABLED != true).");
    return;
  }

  const intervalMs = schedulerIntervalMs();
  log.info(`Material price scheduler enabled (interval ${intervalMs}ms).`);

  void runSchedulerCycle(log).catch((error) => {
    log.error(`Material price scheduler cycle failed: ${(error as Error).message}`);
  });

  setInterval(() => {
    void runSchedulerCycle(log).catch((error) => {
      log.error(`Material price scheduler cycle failed: ${(error as Error).message}`);
    });
  }, intervalMs);
}
