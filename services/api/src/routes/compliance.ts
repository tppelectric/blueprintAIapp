import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { detectMissingDevicesByNecRules } from "../services/nec-device-compliance.js";
import { validateDeviceInstallation } from "../services/device-installation-validator.js";
import { resolveCompanyId } from "../utils/tenant.js";

const roomComplianceSchema = z.object({
  rooms: z.array(
    z.object({
      room: z.string().min(1),
      roomType: z.string().min(1),
      hallwayLengthFeet: z.number().nonnegative().optional(),
      devices: z.array(
        z.object({
          deviceType: z.string().min(1),
          wallSection: z.string().optional().nullable(),
          location: z.string().optional().nullable(),
          isGfci: z.boolean().optional(),
          coordinate: z
            .object({
              x: z.number(),
              y: z.number()
            })
            .optional()
            .nullable()
        })
      ),
      walls: z.array(
        z.object({
          wallSection: z.string().min(1),
          lengthFeet: z.number().nonnegative(),
          room: z.string().min(1),
          roomType: z.string().optional().nullable(),
          isCountertop: z.boolean().optional(),
          outletLocationsFeet: z.array(z.number().nonnegative()).optional()
        })
      )
    })
  )
});

const installationSchema = z.object({
  installations: z.array(
    z.object({
      deviceType: z.string().min(1),
      mountingHeightInches: z.number().positive(),
      roomType: z.string().optional().nullable(),
      installationLocation: z.string().optional().nullable()
    })
  )
});

export const complianceRoutes: FastifyPluginAsync = async (app) => {
  app.post("/compliance/nec/missing-devices", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const parsed = roomComplianceSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid NEC compliance payload", issues: parsed.error.flatten() });
    }

    const missingDeviceReport = detectMissingDevicesByNecRules(parsed.data.rooms);
    return { companyId, missingDeviceReport };
  });

  app.post("/compliance/device-installation", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const parsed = installationSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ message: "Invalid device installation validation payload", issues: parsed.error.flatten() });
    }

    const issues = validateDeviceInstallation(parsed.data.installations);
    return { companyId, issues };
  });
};

