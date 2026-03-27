import {
  appendIntegrationBomLines,
  sumBomMaterialSubtotal,
} from "@/lib/wifi-vendor-hardware";
import {
  computeWifiPlan,
  type VendorChoice,
  type WifiAnalyzerInputs,
  type WifiAnalyzerResults,
} from "@/lib/wifi-analyzer-engine";

const U7_BETTER_OVERRIDE = {
  label: "UniFi U7 Pro ($219 ea.) — Wi‑Fi 7",
  unit: 219,
};

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

function cloneResultsWithBom(
  base: WifiAnalyzerResults,
  bom: WifiAnalyzerResults["hardwareBomLines"],
): WifiAnalyzerResults {
  const materialSubtotalMid = sumBomMaterialSubtotal(bom);
  const hwLow = Math.max(0, Math.round(materialSubtotalMid * 0.85));
  const hwHigh = Math.round(materialSubtotalMid * 1.2);
  return {
    ...base,
    hardwareBomLines: bom,
    materialSubtotalMid,
    hardwareCostEstimateLabel: `$${hwLow.toLocaleString()} – $${hwHigh.toLocaleString()} (est., MSRP-style)`,
  };
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

  const betterBase = computeWifiPlan(
    { ...inputs, vendor: "ubiquiti" },
    {
      vendorForStack: "ubiquiti",
      stackOpts: {
        ubiquitiIndoorOverride: { ...U7_BETTER_OVERRIDE },
        preferWifi7: true,
      },
    },
  );
  const betterBom = appendIntegrationBomLines(betterBase.hardwareBomLines, {
    chowmainUniFi: true,
  });
  const betterR = cloneResultsWithBom(betterBase, betterBom);

  const accessR = computeWifiPlan(inputs, { vendorForStack: "access_networks" });
  const arakR = computeWifiPlan(inputs, { vendorForStack: "araknis" });
  const bestVendor: VendorChoice =
    accessR.materialSubtotalMid <= arakR.materialSubtotalMid
      ? "access_networks"
      : "araknis";
  const bestBase = bestVendor === "access_networks" ? accessR : arakR;
  const bestBom = appendIntegrationBomLines(bestBase.hardwareBomLines, {
    chowmainUniFi: true,
    control4ConnectAnnual: true,
  });
  const bestR = cloneResultsWithBom(bestBase, bestBom);

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
        "Entry equipment (Omada or consumer mesh)",
        goodVendor === "tp_link"
          ? "TP-Link Omada — add Chowmain UniFi driver ~$150 only if pairing with Control4 + UniFi"
          : "eero mesh — not for professional C4 / Josh / Savant",
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
        "UniFi Wi‑Fi 7 (U7 Pro baseline)",
        "BOM: Chowmain UniFi driver $150 (cameras + network presence in Control4)",
        "Network presence detection enables automatic welcome scenes when you arrive home via the Chowmain driver",
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
        bestVendor === "access_networks"
          ? "Access Networks Wi‑Fi 7 (Ruckus technology, Snap One / ADI)"
          : "Araknis integrator line",
        "BOM: Chowmain UniFi driver $150 + Control4 Connect ~$249/yr (optional — remote access / HomeKit; verify Snap One)",
        "Network presence detection enables automatic welcome scenes when you arrive home via the Chowmain driver",
      ],
      results: bestR,
      apModel: bestIn?.description ?? bestR.equipment.apModel,
      apQty: bestIn?.quantity ?? bestR.indoorAps,
      apTotal: bestIn?.lineTotal ?? 0,
    },
  ];
}
