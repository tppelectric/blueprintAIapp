import type { GroundingDesign } from "@package/types";

export function designGroundingSystem(hasUfer: boolean): GroundingDesign {
  return {
    groundRods: 2,
    waterPipeBonding: true,
    uferRecommended: hasUfer,
    notes: [
      "Bond metal water piping within 5 ft of entry",
      "Install grounding electrode conductor per NEC Article 250",
      hasUfer ? "Use UFER electrode where accessible" : "No accessible UFER identified"
    ]
  };
}

