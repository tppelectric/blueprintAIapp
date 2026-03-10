export type WallSectionInput = {
  wallSection: string;
  lengthFeet: number;
  room: string;
  roomType?: string | null;
  isCountertop?: boolean;
  outletLocationsFeet?: number[];
};

export type RoomComplianceInput = {
  room: string;
  roomType: string;
  hallwayLengthFeet?: number;
  devices: Array<{
    deviceType: string;
    wallSection?: string | null;
    location?: string | null;
    isGfci?: boolean;
    coordinate?: { x: number; y: number } | null;
  }>;
  walls: WallSectionInput[];
};

export type MissingDeviceReport = {
  room: string;
  wall_section: string;
  issue: string;
  nec_reference: string;
  recommendation: string;
  distance_detected?: string;
};

function normalizeDeviceType(value: string): string {
  const raw = value.trim().toLowerCase();
  if (raw.includes("gfci")) {
    return "gfci_receptacle";
  }
  if (raw.includes("receptacle") || raw.includes("outlet")) {
    return "receptacle";
  }
  if (raw === "3-way switch") {
    return "3_way_switch";
  }
  if (raw === "4-way switch") {
    return "4_way_switch";
  }
  return raw.replace(/\s+/g, "_");
}

function hasOutletOnWall(room: RoomComplianceInput, wallSection: string): boolean {
  return room.devices.some((device) => {
    const normalized = normalizeDeviceType(device.deviceType);
    return (
      (normalized === "receptacle" || normalized === "gfci_receptacle") &&
      (device.wallSection ?? "").toLowerCase() === wallSection.toLowerCase()
    );
  });
}

function checkSpacing(maxSpacingFeet: number, points: number[], wallLengthFeet: number): number | null {
  if (wallLengthFeet <= 0) {
    return null;
  }
  if (points.length === 0) {
    return wallLengthFeet;
  }

  const sorted = [...points].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return wallLengthFeet;
  }

  let maxGap = Math.max(sorted[0], wallLengthFeet - sorted[sorted.length - 1]);
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap > maxGap) {
      maxGap = gap;
    }
  }

  return maxGap > maxSpacingFeet ? maxGap : null;
}

export function detectMissingDevicesByNecRules(rooms: RoomComplianceInput[]): MissingDeviceReport[] {
  const report: MissingDeviceReport[] = [];

  for (const room of rooms) {
    const roomType = room.roomType.trim().toLowerCase();

    for (const wall of room.walls) {
      const wallLengthFeet = Number(wall.lengthFeet);
      if (!Number.isFinite(wallLengthFeet) || wallLengthFeet <= 0) {
        continue;
      }

      const outletPoints = wall.outletLocationsFeet ?? [];
      if (wallLengthFeet >= 2 && !hasOutletOnWall(room, wall.wallSection) && outletPoints.length === 0) {
        report.push({
          room: room.room,
          wall_section: wall.wallSection,
          issue: "Wall section >= 2 ft has no receptacle",
          nec_reference: "NEC 210.52",
          recommendation: "Add duplex receptacle to satisfy required wall coverage."
        });
      }

      if (wall.isCountertop) {
        const exceededCounterGap = checkSpacing(4, outletPoints, wallLengthFeet);
        if (exceededCounterGap) {
          report.push({
            room: room.room,
            wall_section: wall.wallSection,
            issue: "Countertop receptacle spacing exceeds 4 ft",
            nec_reference: "NEC 210.52(C)",
            recommendation: "Add countertop receptacle(s) to keep spacing within 4 ft.",
            distance_detected: `${Number(exceededCounterGap.toFixed(2))} ft`
          });
        }
      } else {
        const exceededGeneralGap = checkSpacing(12, outletPoints, wallLengthFeet);
        if (exceededGeneralGap) {
          report.push({
            room: room.room,
            wall_section: wall.wallSection,
            issue: "Outlet spacing exceeds NEC limit",
            nec_reference: "NEC 210.52",
            recommendation: "Add duplex receptacle to reduce spacing to 12 ft or less.",
            distance_detected: `${Number(exceededGeneralGap.toFixed(2))} ft`
          });
        }
      }
    }

    if (roomType === "bathroom") {
      const hasGfci = room.devices.some((device) => {
        const normalized = normalizeDeviceType(device.deviceType);
        return normalized === "gfci_receptacle" || Boolean(device.isGfci);
      });
      if (!hasGfci) {
        report.push({
          room: room.room,
          wall_section: "bathroom",
          issue: "Bathroom receptacle requires GFCI protection",
          nec_reference: "NEC 210.8(A)",
          recommendation: "Install GFCI receptacle or provide approved GFCI protection."
        });
      }
    }

    if (roomType === "hallway") {
      const hallwayLengthFeet = Number(room.hallwayLengthFeet ?? 0);
      if (hallwayLengthFeet > 10) {
        const hasHallOutlet = room.devices.some((device) => {
          const normalized = normalizeDeviceType(device.deviceType);
          return normalized === "receptacle" || normalized === "gfci_receptacle";
        });
        if (!hasHallOutlet) {
          report.push({
            room: room.room,
            wall_section: "hallway",
            issue: "Hallway over 10 ft has no receptacle",
            nec_reference: "NEC 210.52(H)",
            recommendation: "Add at least one hallway receptacle."
          });
        }
      }
    }
  }

  return report;
}

