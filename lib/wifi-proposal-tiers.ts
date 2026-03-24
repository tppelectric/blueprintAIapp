import {
  computeWifiPlan,
  type VendorChoice,
  type WifiAnalyzerInputs,
  type WifiAnalyzerResults,
} from "@/lib/wifi-analyzer-engine";

const U6_PRO_LABEL = "UniFi U6 Pro ($179 ea.)";
const U6_PRO_UNIT = 179;

export type ProposalTierId = "good" | "better" | "best";

export type ProposalTierColumn = {
  id: ProposalTierId;
  title: string;
  subtitle: string;
  vendor: VendorChoice;
  blurb: string[];
  results: WifiAnalyzerResults;
  apModel: string;
  apQty: number;
  apTotal: number;
};

function indoorApLine(r: WifiAnalyzerResults) {
  return r.hardwareBomLines?.find((l) => l.id === "indoor-ap");
}

export function computeProposalTierColumns(
  inputs: WifiAnalyzerInputs,
): ProposalTierColumn[] {
  const tpR = computeWifiPlan(inputs, { vendorForStack: "tp_link" });
  const eeR = computeWifiPlan(inputs, { vendorForStack: "eero" });
  const goodVendor: VendorChoice =
    tpR.materialSubtotalMid <= eeR.materialSubtotalMid ? "tp_link" : "eero";
  const goodR =
    goodVendor === "tp_link" ? tpR : eeR;

  const betterR = computeWifiPlan(
    { ...inputs, vendor: "ubiquiti" },
    {
      vendorForStack: "ubiquiti",
      stackOpts: {
        ubiquitiIndoorOverride: { label: U6_PRO_LABEL, unit: U6_PRO_UNIT },
      },
    },
  );

  const accessR = computeWifiPlan(inputs, { vendorForStack: "access_networks" });
  const arakR = computeWifiPlan(inputs, { vendorForStack: "araknis" });
  const bestVendor: VendorChoice =
    accessR.materialSubtotalMid <= arakR.materialSubtotalMid
      ? "access_networks"
      : "araknis";
  const bestR = bestVendor === "access_networks" ? accessR : arakR;

  const goodIn = indoorApLine(goodR);
  const betterIn = indoorApLine(betterR);
  const bestIn = indoorApLine(bestR);

  return [
    {
      id: "good",
      title: "Good",
      subtitle: "Budget",
      vendor: goodVendor,
      blurb: [
        "Entry level equipment",
        goodVendor === "tp_link"
          ? "TP-Link Omada"
          : "eero mesh",
        "Basic coverage",
      ],
      results: goodR,
      apModel: goodIn?.description ?? goodR.equipment.apModel,
      apQty: goodIn?.quantity ?? goodR.indoorAps,
      apTotal: goodIn?.lineTotal ?? 0,
    },
    {
      id: "better",
      title: "Better",
      subtitle: "Recommended",
      vendor: "ubiquiti",
      blurb: [
        "Mid-range equipment",
        "Ubiquiti UniFi U6 Pro",
        "Strong coverage & management",
      ],
      results: betterR,
      apModel: betterIn?.description ?? betterR.equipment.apModel,
      apQty: betterIn?.quantity ?? betterR.indoorAps,
      apTotal: betterIn?.lineTotal ?? 0,
    },
    {
      id: "best",
      title: "Best",
      subtitle: "Premium",
      vendor: bestVendor,
      blurb: [
        "Top tier equipment",
        bestVendor === "access_networks"
          ? "Access Networks"
          : "Araknis",
        "Maximum coverage, smart-home ready",
      ],
      results: bestR,
      apModel: bestIn?.description ?? bestR.equipment.apModel,
      apQty: bestIn?.quantity ?? bestR.indoorAps,
      apTotal: bestIn?.lineTotal ?? 0,
    },
  ];
}
