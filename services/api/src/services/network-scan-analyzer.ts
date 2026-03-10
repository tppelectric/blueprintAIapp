export type NetworkObservation = {
  ssid: string;
  band: "2.4GHz" | "5GHz";
  channel: number;
  rssiDbm: number;
};

export type NetworkScanInput = {
  scanName?: string;
  observations: NetworkObservation[];
};

export type NetworkScanResult = {
  totalNetworks: number;
  avgRssiDbm: number;
  strongestSignalDbm: number;
  weakestSignalDbm: number;
  channelCongestion: Array<{ band: "2.4GHz" | "5GHz"; channel: number; networkCount: number }>;
  qualitySummary: {
    strongCount: number;
    fairCount: number;
    weakCount: number;
  };
  recommendations: string[];
};

function classifyRssi(rssiDbm: number): "strong" | "fair" | "weak" {
  if (rssiDbm >= -67) {
    return "strong";
  }
  if (rssiDbm >= -75) {
    return "fair";
  }
  return "weak";
}

export function analyzeNetworkScan(input: NetworkScanInput): NetworkScanResult {
  const observations = input.observations.filter((row) => row.ssid.trim().length > 0);
  if (observations.length === 0) {
    return {
      totalNetworks: 0,
      avgRssiDbm: 0,
      strongestSignalDbm: 0,
      weakestSignalDbm: 0,
      channelCongestion: [],
      qualitySummary: { strongCount: 0, fairCount: 0, weakCount: 0 },
      recommendations: ["No observed networks were provided. Capture at least one network reading to generate analysis."]
    };
  }

  const rssiValues = observations.map((row) => row.rssiDbm);
  const avgRssiDbm = Number((rssiValues.reduce((sum, value) => sum + value, 0) / observations.length).toFixed(1));
  const strongestSignalDbm = Math.max(...rssiValues);
  const weakestSignalDbm = Math.min(...rssiValues);

  const channelMap = new Map<string, { band: "2.4GHz" | "5GHz"; channel: number; networkCount: number }>();
  for (const row of observations) {
    const key = `${row.band}-${row.channel}`;
    const existing = channelMap.get(key);
    if (!existing) {
      channelMap.set(key, { band: row.band, channel: row.channel, networkCount: 1 });
    } else {
      existing.networkCount += 1;
    }
  }
  const channelCongestion = Array.from(channelMap.values()).sort((a, b) => b.networkCount - a.networkCount);

  const qualitySummary = observations.reduce(
    (acc, row) => {
      const quality = classifyRssi(row.rssiDbm);
      if (quality === "strong") {
        acc.strongCount += 1;
      } else if (quality === "fair") {
        acc.fairCount += 1;
      } else {
        acc.weakCount += 1;
      }
      return acc;
    },
    { strongCount: 0, fairCount: 0, weakCount: 0 }
  );

  const recommendations: string[] = [];
  const topHotspots = channelCongestion.filter((item) => item.networkCount >= 4).slice(0, 3);
  if (topHotspots.length > 0) {
    recommendations.push(
      `High channel congestion detected on ${topHotspots
        .map((item) => `${item.band} ch ${item.channel} (${item.networkCount} networks)`)
        .join(", ")}.`
    );
    recommendations.push("Use non-overlapping channels and lower channel width where interference is heavy.");
  }
  if (qualitySummary.weakCount > qualitySummary.strongCount) {
    recommendations.push("Many observed signals are weak; plan for additional AP density in affected zones.");
  }
  if (avgRssiDbm < -72) {
    recommendations.push("Average RSSI is below target for reliable high-throughput service; validate AP placement and power.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Observed RF conditions are acceptable for a baseline deployment; verify with post-install validation.");
  }

  return {
    totalNetworks: observations.length,
    avgRssiDbm,
    strongestSignalDbm,
    weakestSignalDbm,
    channelCongestion,
    qualitySummary,
    recommendations
  };
}

