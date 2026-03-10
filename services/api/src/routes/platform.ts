import {
  calculateLoad,
  designGroundingSystem,
  designUtilityService,
  estimateDedicatedCircuits,
  generateComplianceReport,
  generateEstimate,
  generateMaterialList,
  generatePanelSchedule,
  monitorMaterialPrices,
  recommendServiceSize
} from "@package/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getCompanySettings } from "../repositories/company-settings-repository.js";
import { saveProjectLoadCalculation } from "../repositories/project-load-calculation-repository.js";
import { saveProjectWifiDesign } from "../repositories/project-wifi-design-repository.js";
import { getDashboardForProject } from "../repositories/project-repository.js";
import { deleteWifiNetworkScan, listWifiNetworkScans, saveWifiNetworkScan } from "../repositories/wifi-network-scan-repository.js";
import { listSupplierAccounts } from "../repositories/supplier-accounts-repository.js";
import { analyzeNetworkScan } from "../services/network-scan-analyzer.js";
import { scanNearbyWifiNetworksFromHost } from "../services/network-scan-os.js";
import { buildWifiPlan } from "../services/wifi-planner.js";
import { getDbPool } from "../db/postgres.js";
import { resolveCompanyId } from "../utils/tenant.js";

const estimateSchema = z.object({
  laborCostPerPoint: z.number().positive().optional(),
  materialCostPerPoint: z.number().positive().optional(),
  markupMultiplier: z.number().positive().optional(),
  points: z.object({
    receptacles: z.number().nonnegative(),
    switches: z.number().nonnegative(),
    lights: z.number().nonnegative(),
    dataPorts: z.number().nonnegative(),
    lowVoltage: z.number().nonnegative()
  }),
  baseLaborHoursPerPoint: z.number().positive().optional(),
  squareFeet: z.number().positive(),
  finishLevel: z.enum(["builder_grade", "mid_range_residential", "high_end_residential"])
});

const loadSchema = z.object({
  projectClass: z.enum(["single_dwelling", "multifamily", "commercial"]),
  electricalSystem: z.enum(["single_120_240", "single_120_208", "three_120_208", "three_277_480"]).optional(),
  squareFeet: z.number().nonnegative(),
  smallApplianceCircuits: z.number().nonnegative(),
  laundryCircuits: z.number().nonnegative().optional(),
  dryers: z.number().nonnegative(),
  rangeVa: z.number().nonnegative().optional(),
  waterHeaterVa: z.number().nonnegative().optional(),
  dishwasherVa: z.number().nonnegative().optional(),
  disposalVa: z.number().nonnegative().optional(),
  microwaveVa: z.number().nonnegative().optional(),
  hvacCoolingVa: z.number().nonnegative().optional(),
  hvacHeatingVa: z.number().nonnegative().optional(),
  poolPumpVa: z.number().nonnegative().optional(),
  poolHeaterVa: z.number().nonnegative().optional(),
  evChargers: z.number().nonnegative().optional(),
  evChargerVa: z.number().nonnegative().optional(),
  otherContinuousLoadsVa: z.number().nonnegative().optional(),
  otherNonContinuousLoadsVa: z.number().nonnegative().optional(),
  largestMotorVa: z.number().nonnegative(),
  additionalLoadsVa: z.number().nonnegative()
});

const utilityDesignSchema = z.object({
  provider: z.enum(["central_hudson", "nyseg"]).optional(),
  serviceAmps: z.number().positive(),
  installationType: z.enum(["overhead", "underground"])
});

const assignLoadSchema = z.object({
  projectId: z.string().min(1),
  jobId: z.string().min(1).optional(),
  input: loadSchema
});

const wifiAnalyzerSchema = z.object({
  squareFeet: z.number().positive(),
  floors: z.number().int().positive().max(25),
  wallDensity: z.enum(["low", "medium", "high"]),
  wallType: z.enum(["drywall", "plaster", "concrete_block", "brick", "metal_stud"]).optional().default("drywall"),
  insulationType: z.enum(["none", "fiberglass", "mineral_wool", "spray_foam", "foil_faced"]).optional().default("fiberglass"),
  structuralMetal: z.enum(["none", "light", "moderate", "heavy"]).optional().default("none"),
  vendorProfile: z.enum(["ubiquiti", "generic"]).optional().default("ubiquiti"),
  highDensityRooms: z.number().int().nonnegative().max(500),
  includeOutdoorCoverage: z.boolean().optional().default(false),
  throughputTargetMbps: z.number().positive().max(10000).optional().default(250),
  concurrentUsers: z.number().int().positive().max(5000).optional().default(35),
  avgDeviceMbps: z.number().positive().max(2000).optional().default(8),
  poeHeadroomPercent: z.number().min(0).max(100).optional().default(25)
});

const assignWifiSchema = z.object({
  projectId: z.string().min(1),
  jobId: z.string().min(1).optional(),
  input: wifiAnalyzerSchema
});

const wifiFromPlansSchema = z.object({
  projectId: z.string().min(1),
  jobId: z.string().min(1).optional(),
  wallType: z.enum(["drywall", "plaster", "concrete_block", "brick", "metal_stud"]).optional().default("drywall"),
  insulationType: z.enum(["none", "fiberglass", "mineral_wool", "spray_foam", "foil_faced"]).optional().default("fiberglass"),
  structuralMetal: z.enum(["none", "light", "moderate", "heavy"]).optional().default("none"),
  vendorProfile: z.enum(["ubiquiti", "generic"]).optional().default("ubiquiti"),
  includeOutdoorCoverage: z.boolean().optional().default(false),
  throughputTargetMbps: z.number().positive().max(10000).optional().default(300),
  concurrentUsers: z.number().int().positive().max(5000).optional().default(35),
  avgDeviceMbps: z.number().positive().max(2000).optional().default(8),
  poeHeadroomPercent: z.number().min(0).max(100).optional().default(25)
});

const networkScanSchema = z.object({
  projectId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  scanName: z.string().min(1).max(120).optional(),
  observations: z.array(
    z.object({
      ssid: z.string().min(1),
      band: z.enum(["2.4GHz", "5GHz"]),
      channel: z.number().int().positive(),
      rssiDbm: z.number().max(0)
    })
  )
});

const autoNetworkScanSchema = z.object({
  projectId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  scanName: z.string().min(1).max(120).optional()
});

function mapDefaultUtilityProvider(value: "Central Hudson" | "NYSEG"): "central_hudson" | "nyseg" {
  return value === "NYSEG" ? "nyseg" : "central_hudson";
}

function mapDefaultVoltageSystem(
  value: "120/240" | "120/208" | "277/480"
): "single_120_240" | "single_120_208" | "three_277_480" {
  if (value === "120/208") {
    return "single_120_208";
  }
  if (value === "277/480") {
    return "three_277_480";
  }
  return "single_120_240";
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

function applyCompanyMaterialPreferences(
  materials: ReturnType<typeof generateMaterialList>,
  settings: {
    preferredWireBrand: string | null;
    preferredDeviceBrand: string | null;
    preferredBreakerBrand: string | null;
  }
) {
  return materials.map((item) => {
    const name = item.item.toLowerCase();
    let brand = item.brand;
    if ((name.includes("thhn") || name.includes("nm-b")) && settings.preferredWireBrand) {
      brand = settings.preferredWireBrand;
    } else if ((name.includes("switch") || name.includes("receptacle")) && settings.preferredDeviceBrand) {
      brand = settings.preferredDeviceBrand;
    } else if (name.includes("breaker") && settings.preferredBreakerBrand) {
      brand = settings.preferredBreakerBrand;
    }
    return { ...item, brand };
  });
}

export const platformRoutes: FastifyPluginAsync = async (app) => {
  const normalizeOptionalQueryValue = (value?: string) => {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  app.get("/platform/dashboard", async (request, reply) => {
    const companyId = resolveCompanyId(request);

    try {
      const [settings, supplierAccounts] = await Promise.all([
        getCompanySettings(companyId),
        listSupplierAccounts(companyId)
      ]);
      const estimateInput = {
        laborCostPerPoint: Number(
          (
            settings.defaultLaborRate *
            settings.defaultLaborHoursPerPoint *
            (1 + settings.laborBurdenPercentage / 100)
          ).toFixed(2)
        ),
        materialCostPerPoint: Number(
          (
            settings.defaultPricePerPoint -
            settings.defaultLaborRate * settings.defaultLaborHoursPerPoint
          ).toFixed(2)
        ),
        markupMultiplier: Number(
          (
            1 +
            (settings.materialMarkupPercentage + settings.overheadPercentage + settings.profitMarginPercentage) /
              100
          ).toFixed(4)
        ),
        points: {
          receptacles: 88,
          switches: 42,
          lights: 76,
          dataPorts: 24,
          lowVoltage: 18
        },
        baseLaborHoursPerPoint: settings.defaultLaborHoursPerPoint,
        squareFeet: 6400,
        finishLevel: "mid_range_residential" as const
      };

      if (estimateInput.materialCostPerPoint <= 0) {
        return reply.code(409).send({
          message:
            "Company settings are incomplete for dashboard estimate. Update Company Settings so default_price_per_point is higher than labor cost per point."
        });
      }

      const estimates = generateEstimate(estimateInput);
      const loadCalculation = calculateLoad({
        projectClass: "multifamily",
        electricalSystem: mapDefaultVoltageSystem(settings.defaultVoltageSystem),
        squareFeet: 6400,
        smallApplianceCircuits: 4,
        dryers: 2,
        largestMotorVa: 4200,
        additionalLoadsVa: 22000
      });
      loadCalculation.assumptions = [
        ...loadCalculation.assumptions,
        `Load calculation method: ${settings.loadCalculationMethod}`,
        `Electrical code version: ${settings.electricalCodeVersion}`
      ];

      const panelSchedulePreview = generatePanelSchedule(estimateDedicatedCircuits()).slice(0, 12);
      const materialPrices = applyCompanyPricePreferences(monitorMaterialPrices(), {
        allowedSuppliers: new Set(supplierAccounts.map((account) => account.supplierName)),
        preferredWireBrand: settings.preferredWireBrand,
        preferredDeviceBrand: settings.preferredDeviceBrand,
        preferredBreakerBrand: settings.preferredBreakerBrand
      });
      const serviceDesign = designUtilityService(
        mapDefaultUtilityProvider(settings.defaultUtilityProvider),
        loadCalculation.recommendedServiceSize,
        "underground"
      );
      const complianceSummary = generateComplianceReport();

      return {
        companyId,
        scope: "company_reference",
        dashboard: {
          projectName: "ElectricalEstimator AI - Hudson Valley Multifamily",
          projectType: "multifamily",
          estimates,
          loadCalculation,
          panelSchedulePreview,
          materialPrices,
          serviceDesign,
          complianceSummary
        }
      };
    } catch (error) {
      return reply.code(502).send({ message: "Could not load platform dashboard", detail: (error as Error).message });
    }
  });

  app.post("/platform/estimate", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const parsed = estimateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid estimate payload", issues: parsed.error.flatten() });
    }

    try {
      const settings = await getCompanySettings(companyId);
      const laborCostPerPoint =
        parsed.data.laborCostPerPoint ??
        Number(
          (
            settings.defaultLaborRate *
            settings.defaultLaborHoursPerPoint *
            (1 + settings.laborBurdenPercentage / 100)
          ).toFixed(2)
        );
      const materialCostPerPoint =
        parsed.data.materialCostPerPoint ??
        Number((settings.defaultPricePerPoint - laborCostPerPoint).toFixed(2));
      if (materialCostPerPoint <= 0) {
        return reply.code(409).send({
          message:
            "Company settings are incomplete for estimating. Update Company Settings so default_price_per_point is higher than labor cost per point."
        });
      }

      const markupMultiplier =
        parsed.data.markupMultiplier ??
        Number(
          (
            1 +
            (settings.materialMarkupPercentage + settings.overheadPercentage + settings.profitMarginPercentage) /
              100
          ).toFixed(4)
        );

      return {
        companyId,
        scope: "company_reference",
        estimate: generateEstimate({
          ...parsed.data,
          laborCostPerPoint,
          materialCostPerPoint,
          markupMultiplier,
          baseLaborHoursPerPoint: parsed.data.baseLaborHoursPerPoint ?? settings.defaultLaborHoursPerPoint
        })
      };
    } catch (error) {
      return reply.code(502).send({ message: "Could not generate estimate", detail: (error as Error).message });
    }
  });

  app.post("/platform/load-calculator", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const parsed = loadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid load payload", issues: parsed.error.flatten() });
    }

    try {
      const settings = await getCompanySettings(companyId);
      const load = calculateLoad({
        ...parsed.data,
        electricalSystem: parsed.data.electricalSystem ?? mapDefaultVoltageSystem(settings.defaultVoltageSystem)
      });
      load.assumptions = [
        ...load.assumptions,
        `Load calculation method: ${settings.loadCalculationMethod}`,
        `Electrical code version: ${settings.electricalCodeVersion}`
      ];

      return { companyId, scope: "company_reference", load };
    } catch (error) {
      return reply.code(502).send({ message: "Could not calculate load", detail: (error as Error).message });
    }
  });

  app.post("/platform/load-calculator/assign", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const parsed = assignLoadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid load assign payload", issues: parsed.error.flatten() });
    }

    try {
      const settings = await getCompanySettings(companyId);
      const pool = getDbPool();

      const projectCheck = await pool.query(
        `
        SELECT id
        FROM projects
        WHERE company_id::text = $1
          AND id::text = $2
        LIMIT 1
        `,
        [companyId, parsed.data.projectId]
      );
      if (projectCheck.rows.length === 0) {
        return reply.code(404).send({ message: "Project not found for company scope" });
      }

      if (parsed.data.jobId) {
        const jobCheck = await pool.query(
          `
          SELECT id
          FROM project_jobs
          WHERE company_id = $1
            AND project_id = $2
            AND id = $3
          LIMIT 1
          `,
          [companyId, parsed.data.projectId, parsed.data.jobId]
        );
        if (jobCheck.rows.length === 0) {
          return reply.code(404).send({ message: "Job not found for project scope" });
        }
      }

      const input = {
        ...parsed.data.input,
        electricalSystem: parsed.data.input.electricalSystem ?? mapDefaultVoltageSystem(settings.defaultVoltageSystem)
      };
      const load = calculateLoad(input);
      load.assumptions = [
        ...load.assumptions,
        `Load calculation method: ${settings.loadCalculationMethod}`,
        `Electrical code version: ${settings.electricalCodeVersion}`
      ];

      const saved = await saveProjectLoadCalculation({
        companyId,
        projectId: parsed.data.projectId,
        jobId: parsed.data.jobId,
        input,
        result: load
      });

      return {
        companyId,
        projectId: parsed.data.projectId,
        jobId: parsed.data.jobId ?? null,
        loadCalculationId: saved.loadCalculationId,
        load
      };
    } catch (error) {
      return reply.code(502).send({ message: "Could not assign load calculation", detail: (error as Error).message });
    }
  });

  app.post("/platform/wifi-analyzer", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const parsed = wifiAnalyzerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid WiFi analyzer payload", issues: parsed.error.flatten() });
    }

    const plan = buildWifiPlan(parsed.data);
    return { companyId, scope: "company_reference", wifiPlan: plan };
  });

  app.post("/platform/wifi-analyzer/ai-from-plans", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const parsed = wifiFromPlansSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid WiFi plan analysis payload", issues: parsed.error.flatten() });
    }

    try {
      const dashboard = await getDashboardForProject(companyId, parsed.data.projectId, parsed.data.jobId);
      if (!dashboard) {
        return reply.code(404).send({ message: "Project or job data not found for company scope." });
      }

      const totalArea = dashboard.rooms.reduce((sum, room) => sum + (Number(room.areaSqFt) || 0), 0);
      if (totalArea <= 0) {
        return reply.code(409).send({
          message:
            "No room area data found from imported plans. Import/scan plans first, then run AI analysis, or use standalone manual input."
        });
      }

      const floorHints = new Set(
        dashboard.rooms
          .map((room) => room.name.toLowerCase())
          .flatMap((name) => {
            const labels: string[] = [];
            if (name.includes("basement")) {
              labels.push("basement");
            }
            if (name.includes("first floor") || name.includes("1st floor")) {
              labels.push("first");
            }
            if (name.includes("second floor") || name.includes("2nd floor")) {
              labels.push("second");
            }
            if (name.includes("third floor") || name.includes("3rd floor")) {
              labels.push("third");
            }
            return labels;
          })
      );

      const floors = Math.max(1, floorHints.size || 1);
      const symbolCount = dashboard.symbols.length;
      const highDensityRooms = Math.max(
        0,
        dashboard.rooms.filter((room) => {
          const name = room.name.toLowerCase();
          return name.includes("conference") || name.includes("office") || name.includes("living") || name.includes("lobby");
        }).length
      );

      const derivedInput = {
        squareFeet: Math.round(totalArea / floors),
        floors,
        wallDensity: symbolCount > 300 ? "high" : symbolCount > 120 ? "medium" : "low",
        wallType: parsed.data.wallType,
        insulationType: parsed.data.insulationType,
        structuralMetal: parsed.data.structuralMetal,
        vendorProfile: parsed.data.vendorProfile,
        highDensityRooms,
        includeOutdoorCoverage: parsed.data.includeOutdoorCoverage,
        throughputTargetMbps: parsed.data.throughputTargetMbps,
        concurrentUsers: parsed.data.concurrentUsers,
        avgDeviceMbps: parsed.data.avgDeviceMbps,
        poeHeadroomPercent: parsed.data.poeHeadroomPercent
      } as const;

      const wifiPlan = buildWifiPlan(derivedInput);
      return {
        companyId,
        projectId: parsed.data.projectId,
        jobId: parsed.data.jobId ?? null,
        scope: "ai_from_imported_plans",
        derivedInput,
        wifiPlan
      };
    } catch (error) {
      return reply.code(502).send({ message: "Could not run AI WiFi plan analysis", detail: (error as Error).message });
    }
  });

  app.post("/platform/wifi-analyzer/assign", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const parsed = assignWifiSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid WiFi assign payload", issues: parsed.error.flatten() });
    }

    try {
      const pool = getDbPool();
      const projectCheck = await pool.query(
        `
        SELECT id
        FROM projects
        WHERE company_id::text = $1
          AND id::text = $2
        LIMIT 1
        `,
        [companyId, parsed.data.projectId]
      );
      if (projectCheck.rows.length === 0) {
        return reply.code(404).send({ message: "Project not found for company scope" });
      }

      if (parsed.data.jobId) {
        const jobCheck = await pool.query(
          `
          SELECT id
          FROM project_jobs
          WHERE company_id = $1
            AND project_id = $2
            AND id = $3
          LIMIT 1
          `,
          [companyId, parsed.data.projectId, parsed.data.jobId]
        );
        if (jobCheck.rows.length === 0) {
          return reply.code(404).send({ message: "Job not found for project scope" });
        }
      }

      const wifiPlan = buildWifiPlan(parsed.data.input);
      const saved = await saveProjectWifiDesign({
        companyId,
        projectId: parsed.data.projectId,
        jobId: parsed.data.jobId,
        input: parsed.data.input,
        result: wifiPlan
      });

      return {
        companyId,
        projectId: parsed.data.projectId,
        jobId: parsed.data.jobId ?? null,
        wifiDesignId: saved.wifiDesignId,
        wifiPlan
      };
    } catch (error) {
      return reply.code(502).send({ message: "Could not assign WiFi plan", detail: (error as Error).message });
    }
  });

  app.post("/platform/wifi-analyzer/network-scan", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const parsed = networkScanSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid network scan payload", issues: parsed.error.flatten() });
    }

    try {
      const scanResult = analyzeNetworkScan({
        scanName: parsed.data.scanName,
        observations: parsed.data.observations
      });
      const saved = await saveWifiNetworkScan({
        companyId,
        projectId: parsed.data.projectId,
        jobId: parsed.data.jobId,
        scanName: parsed.data.scanName,
        input: parsed.data as unknown as Record<string, unknown>,
        result: scanResult as unknown as Record<string, unknown>
      });
      return {
        companyId,
        scan: saved
      };
    } catch (error) {
      return reply.code(502).send({ message: "Could not process network scan", detail: (error as Error).message });
    }
  });

  app.post("/platform/wifi-analyzer/network-scan/auto", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const parsed = autoNetworkScanSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid auto network scan payload", issues: parsed.error.flatten() });
    }

    try {
      const observations = await scanNearbyWifiNetworksFromHost();
      if (observations.length === 0) {
        return reply.code(422).send({
          message: "No nearby WiFi networks were detected on this host. Confirm WiFi adapter is enabled and retry."
        });
      }

      const scanResult = analyzeNetworkScan({
        scanName: parsed.data.scanName,
        observations
      });
      const saved = await saveWifiNetworkScan({
        companyId,
        projectId: parsed.data.projectId,
        jobId: parsed.data.jobId,
        scanName: parsed.data.scanName ?? `Auto Scan ${new Date().toISOString()}`,
        input: {
          source: "host_auto_scan",
          projectId: parsed.data.projectId ?? null,
          jobId: parsed.data.jobId ?? null,
          observations
        },
        result: scanResult as unknown as Record<string, unknown>
      });
      return {
        companyId,
        scan: saved,
        observationsCaptured: observations.length
      };
    } catch (error) {
      return reply.code(502).send({
        message: "Could not run auto network scan on this host",
        detail: (error as Error).message
      });
    }
  });

  app.get("/platform/wifi-analyzer/network-scan/history", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const query = request.query as { projectId?: string; jobId?: string; limit?: string };
    try {
      const history = await listWifiNetworkScans({
        companyId,
        projectId: normalizeOptionalQueryValue(query.projectId),
        jobId: normalizeOptionalQueryValue(query.jobId),
        limit: query.limit ? Number(query.limit) : 25
      });
      return { companyId, history };
    } catch (error) {
      return reply.code(502).send({ message: "Could not load network scan history", detail: (error as Error).message });
    }
  });

  app.delete("/platform/wifi-analyzer/network-scan/:scanId", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const params = request.params as { scanId: string };

    try {
      const deleted = await deleteWifiNetworkScan({ companyId, scanId: params.scanId });
      if (!deleted) {
        return reply.code(404).send({ message: "Network scan not found for company scope." });
      }
      return { companyId, scanId: params.scanId, deleted: true };
    } catch (error) {
      return reply.code(502).send({ message: "Could not delete network scan", detail: (error as Error).message });
    }
  });

  app.get("/platform/dedicated-circuits", async (request) => {
    const companyId = resolveCompanyId(request);
    const circuits = estimateDedicatedCircuits();
    return { companyId, scope: "company_reference", circuits, panelSchedule: generatePanelSchedule(circuits) };
  });

  app.post("/platform/utility-service", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const parsed = utilityDesignSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid utility design payload", issues: parsed.error.flatten() });
    }

    const settings = await getCompanySettings(companyId);
    const provider = parsed.data.provider ?? mapDefaultUtilityProvider(settings.defaultUtilityProvider);
    const recommended = recommendServiceSize(parsed.data.serviceAmps);
    return {
      companyId,
      scope: "company_reference",
      serviceSize: recommended,
      design: designUtilityService(provider, recommended, parsed.data.installationType)
    };
  });

  app.get("/platform/grounding", async (request) => {
    const companyId = resolveCompanyId(request);
    return { companyId, scope: "company_reference", grounding: designGroundingSystem(true) };
  });

  app.get("/platform/material-prices", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    try {
      const [settings, supplierAccounts] = await Promise.all([
        getCompanySettings(companyId),
        listSupplierAccounts(companyId)
      ]);

      return {
        companyId,
        scope: "company_reference",
        prices: applyCompanyPricePreferences(monitorMaterialPrices(), {
          allowedSuppliers: new Set(supplierAccounts.map((account) => account.supplierName)),
          preferredWireBrand: settings.preferredWireBrand,
          preferredDeviceBrand: settings.preferredDeviceBrand,
          preferredBreakerBrand: settings.preferredBreakerBrand
        })
      };
    } catch (error) {
      return reply.code(502).send({ message: "Could not load material prices", detail: (error as Error).message });
    }
  });

  app.get("/platform/material-list", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    try {
      const settings = await getCompanySettings(companyId);
      return {
        companyId,
        scope: "company_reference",
        materials: applyCompanyMaterialPreferences(generateMaterialList(), settings)
      };
    } catch (error) {
      return reply.code(502).send({ message: "Could not load material list", detail: (error as Error).message });
    }
  });

  app.get("/platform/compliance-report", async (request) => {
    const companyId = resolveCompanyId(request);
    return { companyId, scope: "company_reference", report: generateComplianceReport() };
  });
};

