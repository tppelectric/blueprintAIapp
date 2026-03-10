import type { UtilityServiceDesign } from "@package/types";

type ServiceSize = "150A" | "200A" | "320A" | "400A" | "CT metering";
type InstallationType = "overhead" | "underground";

export function designCentralHudsonService(
  serviceSize: ServiceSize,
  installationType: InstallationType
): UtilityServiceDesign {
  const ctRequired = serviceSize === "400A" || serviceSize === "CT metering";
  const meterSocket =
    serviceSize === "320A"
      ? "320A meter socket"
      : ctRequired
        ? "CT-rated metering assembly"
        : "Standard meter socket (up to 200A)";

  const serviceConductors =
    serviceSize === "CT metering"
      ? "Utility-engineered parallel conductors (manual confirmation required)"
      : "Utility-approved service conductor size per Central Hudson 2026 table (manual confirmation required)";

  return {
    utilityProvider: "central_hudson",
    ruleEngine: "central_hudson_bluebook_2026",
    ruleVersion: "Central Hudson Blue Book 2026",
    ruleReferences: [
      "Central Hudson Blue Book 2026 - service entrance and metering requirements",
      "Metering thresholds: <=200A standard, 320A socket, >=400A CT metering"
    ],
    serviceSize,
    recommendedMeterSocket: meterSocket,
    ctCabinetRequired: ctRequired,
    serviceConductors,
    transformerRequirement: ctRequired
      ? "CT cabinet and transformer coordination required with Central Hudson engineering"
      : "Standard utility transformer configuration",
    installationType,
    components:
      installationType === "overhead"
        ? ["weatherhead", "service mast", "service drop anchoring"]
        : ["PVC conduit", "transformer pad coordination", "primary conduit routing"]
  };
}

