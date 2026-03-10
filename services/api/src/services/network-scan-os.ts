import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { NetworkObservation } from "./network-scan-analyzer.js";

const execFileAsync = promisify(execFile);

function percentToDbm(signalPercent: number): number {
  const clamped = Math.max(0, Math.min(100, signalPercent));
  return Math.round(clamped / 2 - 100);
}

function detectBandFromChannel(channel: number): "2.4GHz" | "5GHz" {
  return channel >= 36 ? "5GHz" : "2.4GHz";
}

export async function scanNearbyWifiNetworksFromHost(): Promise<NetworkObservation[]> {
  if (process.platform !== "win32") {
    throw new Error("Auto scan is currently supported on Windows hosts only.");
  }

  const { stdout } = await execFileAsync("netsh", ["wlan", "show", "networks", "mode=bssid"], {
    windowsHide: true,
    timeout: 20_000,
    maxBuffer: 1024 * 1024 * 4
  });

  const lines = stdout.split(/\r?\n/);
  const observations: NetworkObservation[] = [];

  let currentSsid: string | null = null;
  let currentSignalPercent: number | null = null;
  let currentChannel: number | null = null;
  let currentBand: "2.4GHz" | "5GHz" | null = null;

  const flushObservation = () => {
    if (!currentSsid || currentSignalPercent === null || currentChannel === null) {
      return;
    }
    observations.push({
      ssid: currentSsid,
      band: currentBand ?? detectBandFromChannel(currentChannel),
      channel: currentChannel,
      rssiDbm: percentToDbm(currentSignalPercent)
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const ssidMatch = line.match(/^SSID\s+\d+\s*:\s*(.*)$/i);
    if (ssidMatch) {
      flushObservation();
      const parsed = ssidMatch[1].trim();
      currentSsid = parsed.length > 0 ? parsed : "Hidden Network";
      currentSignalPercent = null;
      currentChannel = null;
      currentBand = null;
      continue;
    }

    const signalMatch = line.match(/^Signal\s*:\s*(\d+)%$/i);
    if (signalMatch) {
      currentSignalPercent = Number(signalMatch[1]);
      continue;
    }

    const channelMatch = line.match(/^Channel\s*:\s*(\d+)$/i);
    if (channelMatch) {
      currentChannel = Number(channelMatch[1]);
      continue;
    }

    const bandMatch = line.match(/^Band\s*:\s*(.+)$/i);
    if (bandMatch) {
      currentBand = bandMatch[1].includes("5") ? "5GHz" : "2.4GHz";
      continue;
    }
  }

  flushObservation();

  // Keep strongest reading per SSID+channel.
  const deduped = new Map<string, NetworkObservation>();
  for (const row of observations) {
    const key = `${row.ssid}|${row.band}|${row.channel}`;
    const existing = deduped.get(key);
    if (!existing || row.rssiDbm > existing.rssiDbm) {
      deduped.set(key, row);
    }
  }

  return Array.from(deduped.values());
}
