export type InstallationValidationInput = {
  deviceType: string;
  mountingHeightInches: number;
  roomType?: string | null;
  installationLocation?: string | null;
};

export type InstallationValidationIssue = {
  device_type: string;
  detected_height: string;
  issue: string;
  recommendation: string;
  nec_reference?: string;
};

type HeightRule = {
  min: number;
  max: number;
  label: string;
  recommendation: string;
  necReference?: string;
};

const HEIGHT_RULES: Record<string, HeightRule> = {
  switch: {
    min: 44,
    max: 52,
    label: "Switch typical height",
    recommendation: "Lower or raise switch to around 48 inches AFF."
  },
  receptacle: {
    min: 12,
    max: 18,
    label: "Standard receptacle height",
    recommendation: "Set standard receptacle between 12 and 18 inches AFF."
  },
  ada_receptacle: {
    min: 15,
    max: 48,
    label: "ADA receptacle mounting range",
    recommendation: "Set ADA receptacle between 15 and 48 inches AFF."
  },
  thermostat: {
    min: 48,
    max: 54,
    label: "Thermostat typical height",
    recommendation: "Set thermostat between 48 and 54 inches AFF."
  }
};

function normalizeDeviceType(value: string): string {
  const raw = value.trim().toLowerCase();
  if (raw === "duplex receptacle" || raw === "gfci receptacle" || raw === "outlet") {
    return "receptacle";
  }
  if (raw === "ada receptacle" || raw === "ada outlet") {
    return "ada_receptacle";
  }
  return raw;
}

export function validateDeviceInstallation(inputs: InstallationValidationInput[]): InstallationValidationIssue[] {
  const issues: InstallationValidationIssue[] = [];

  for (const entry of inputs) {
    const deviceType = normalizeDeviceType(entry.deviceType);
    const height = Number(entry.mountingHeightInches);
    if (!Number.isFinite(height) || height <= 0) {
      issues.push({
        device_type: entry.deviceType,
        detected_height: String(entry.mountingHeightInches),
        issue: "Invalid mounting height input",
        recommendation: "Enter a valid height in inches above finished floor (AFF)."
      });
      continue;
    }

    const rule = HEIGHT_RULES[deviceType];
    if (rule && (height < rule.min || height > rule.max)) {
      const direction = height > rule.max ? "above" : "below";
      issues.push({
        device_type: entry.deviceType,
        detected_height: `${height} inches`,
        issue: `${rule.label} (${direction} acceptable range)`,
        recommendation: rule.recommendation,
        ...(rule.necReference ? { nec_reference: rule.necReference } : {})
      });
    }

    const room = (entry.roomType ?? "").trim().toLowerCase();
    const location = (entry.installationLocation ?? "").trim().toLowerCase();
    if (
      room === "bathroom" &&
      deviceType === "receptacle" &&
      !location.includes("gfci") &&
      !entry.deviceType.toLowerCase().includes("gfci")
    ) {
      issues.push({
        device_type: entry.deviceType,
        detected_height: `${height} inches`,
        issue: "Bathroom receptacle not marked as GFCI-protected",
        recommendation: "Use GFCI protection for bathroom receptacle installation.",
        nec_reference: "NEC 210.8(A)"
      });
    }
  }

  return issues;
}

