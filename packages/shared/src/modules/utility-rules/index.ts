import type { UtilityProvider, UtilityServiceDesign } from "@package/types";
import { designCentralHudsonService } from "./central-hudson-rules.js";
import { designNYSEGService } from "./nyseg-rules.js";

type ServiceSize = "150A" | "200A" | "320A" | "400A" | "CT metering";
type InstallationType = "overhead" | "underground";

export function designUtilityService(
  provider: UtilityProvider,
  serviceSize: ServiceSize,
  installationType: InstallationType
): UtilityServiceDesign {
  if (provider === "central_hudson") {
    return designCentralHudsonService(serviceSize, installationType);
  }

  return designNYSEGService(serviceSize, installationType);
}

export * from "./central-hudson-rules.js";
export * from "./nyseg-rules.js";
