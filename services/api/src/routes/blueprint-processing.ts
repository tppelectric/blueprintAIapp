import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { ScanMode, ScannerExtractResult } from "@package/shared";
import { extractSheetWithScanner, splitSheetsWithScanner } from "../integrations/scanner/client.js";
import {
  listBlueprintProcessingRuns,
  saveBlueprintProcessingRun
} from "../repositories/blueprint-processing-repository.js";
import { resolveCompanyId } from "../utils/tenant.js";

const requestSchema = z.object({
  jobId: z.string().min(1).optional(),
  fileName: z.string().min(1),
  scanMode: z.enum(["mock", "real"]).optional().default("mock")
});

function buildDeviceCounts(extractions: ScannerExtractResult[]) {
  const byRoom = new Map<string, Record<string, number>>();
  const totals = new Map<string, number>();

  for (const extraction of extractions) {
    for (const symbol of extraction.symbols) {
      const room = symbol.room || "Unassigned";
      if (!byRoom.has(room)) {
        byRoom.set(room, {});
      }

      const roomCounts = byRoom.get(room)!;
      roomCounts[symbol.type] = (roomCounts[symbol.type] ?? 0) + 1;
      totals.set(symbol.type, (totals.get(symbol.type) ?? 0) + 1);
    }
  }

  return {
    totals: Object.fromEntries(totals.entries()),
    byRoom: Object.fromEntries(byRoom.entries())
  };
}

export const blueprintProcessingRoutes: FastifyPluginAsync = async (app) => {
  app.get("/projects/:projectId/blueprint-processing-runs", async (request, reply) => {
    const params = request.params as { projectId: string };
    const query = request.query as { jobId?: string };
    const companyId = resolveCompanyId(request);

    try {
      const runs = await listBlueprintProcessingRuns({
        companyId,
        projectId: params.projectId,
        jobId: query.jobId,
        limit: 20
      });

      return {
        companyId,
        projectId: params.projectId,
        runs
      };
    } catch (error) {
      app.log.error(error);
      return reply.code(502).send({ message: "Could not load blueprint processing runs", detail: (error as Error).message });
    }
  });

  app.post("/projects/:projectId/blueprint-processing", async (request, reply) => {
    const params = request.params as { projectId: string };
    const parsed = requestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid blueprint processing payload", issues: parsed.error.flatten() });
    }

    const companyId = resolveCompanyId(request);
    const { jobId, fileName, scanMode } = parsed.data;

    try {
      const sheets = await splitSheetsWithScanner(params.projectId, fileName, scanMode as ScanMode);
      if (sheets.length === 0) {
        return reply.code(422).send({ message: "Scanner returned no sheets" });
      }

      const extractions: ScannerExtractResult[] = [];
      for (const sheet of sheets) {
        const extraction = await extractSheetWithScanner(
          params.projectId,
          sheet.sheet_number,
          fileName,
          scanMode as ScanMode
        );
        extractions.push(extraction);
      }

      const roomNames = new Set<string>();
      for (const extraction of extractions) {
        for (const room of extraction.rooms) {
          roomNames.add(room.name);
        }
      }

      const deviceCounts = buildDeviceCounts(extractions);
      const persistence = await saveBlueprintProcessingRun({
        companyId,
        projectId: params.projectId,
        jobId,
        fileName,
        scanMode,
        sheets,
        detectedRooms: Array.from(roomNames),
        deviceCounts,
        extractions
      });

      return {
        companyId,
        projectId: params.projectId,
        runId: persistence.runId,
        scanMode,
        processedSheets: sheets.length,
        detectedRooms: Array.from(roomNames),
        deviceCounts
      };
    } catch (error) {
      app.log.error(error);
      return reply.code(502).send({ message: "Blueprint processing failed", detail: (error as Error).message });
    }
  });
};

