import type { UtilityServiceDesign } from "@package/types";

type ServiceSize = "150A" | "200A" | "320A" | "400A" | "CT metering";
type InstallationType = "overhead" | "underground";

export function designNYSEGService(serviceSize: ServiceSize, installationType: InstallationType): UtilityServiceDesign {
  const ctRequired = serviceSize === "400A" || serviceSize === "CT metering";

  return {
    utilityProvider: "nyseg",
    ruleEngine: "nyseg_local_rules",
    ruleVersion: "NYSEG published service requirements",
    ruleReferences: ["NYSEG service and metering requirements"],
    serviceSize,
    recommendedMeterSocket: ctRequired ? "CT-rated metering assembly" : "Standard utility-approved meter socket",
    ctCabinetRequired: ctRequired,
    serviceConductors: ctRequired
      ? "Utility-engineered parallel conductors (manual confirmation required)"
      : "Utility-approved service conductor size per latest NYSEG requirements (manual confirmation required)",
    transformerRequirement: ctRequired ? "Utility engineering coordination required" : "Standard transformer service",
    installationType,
    components:
      installationType === "overhead"
        ? ["weatherhead", "service mast", "service drop anchoring"]
        : ["PVC conduit", "transformer pad coordination", "primary conduit routing"]
  };
}

