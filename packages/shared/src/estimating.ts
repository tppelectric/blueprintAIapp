import type {
  ElectricalSymbolType,
  LightingCircuit,
  MaterialEstimate,
  Room,
  RoomTakeoff,
  SymbolDetection
} from "@package/types";

const TRACKED_TYPES: ElectricalSymbolType[] = [
  "outlet",
  "switch",
  "dimmer",
  "light",
  "recessed_light",
  "fan",
  "cat6",
  "speaker",
  "camera",
  "smoke_co"
];

function createEmptyCounts(): Record<ElectricalSymbolType, number> {
  return {
    outlet: 0,
    switch: 0,
    dimmer: 0,
    light: 0,
    recessed_light: 0,
    fan: 0,
    cat6: 0,
    speaker: 0,
    camera: 0,
    smoke_co: 0,
    unknown: 0
  };
}

export function buildRoomTakeoffs(rooms: Room[], symbols: SymbolDetection[]): RoomTakeoff[] {
  const byRoom = new Map<string, Record<ElectricalSymbolType, number>>();

  for (const room of rooms) {
    byRoom.set(room.id, createEmptyCounts());
  }

  for (const symbol of symbols) {
    const bucket = byRoom.get(symbol.roomId);
    if (!bucket) {
      continue;
    }
    bucket[symbol.symbolType] += 1;
  }

  return rooms.map((room) => ({
    roomId: room.id,
    roomName: room.name,
    counts: byRoom.get(room.id) ?? createEmptyCounts()
  }));
}

export function buildLightingCircuits(takeoffs: RoomTakeoff[]): LightingCircuit[] {
  return takeoffs.map((takeoff, index) => {
    const fixtureCount = takeoff.counts.light + takeoff.counts.recessed_light + takeoff.counts.fan;
    const assumedWatts = fixtureCount * 60;
    const estimatedAmps = Number((assumedWatts / 120).toFixed(2));
    const dimmerLoadWatts = (takeoff.counts.light + takeoff.counts.recessed_light) * 60;
    const dimmerType = dimmerLoadWatts > 150 ? "high_capacity_led_dimmer" : "standard_led_150w";

    return {
      id: `LC-${index + 1}`,
      roomName: takeoff.roomName,
      fixtureCount,
      assumedWatts,
      estimatedAmps,
      dimmerType
    };
  });
}

export function buildMaterialEstimate(takeoffs: RoomTakeoff[]): MaterialEstimate[] {
  const totals = createEmptyCounts();

  for (const takeoff of takeoffs) {
    for (const type of TRACKED_TYPES) {
      totals[type] += takeoff.counts[type];
    }
  }

  const wireFeet =
    totals.outlet * 35 +
    totals.switch * 15 +
    totals.light * 20 +
    totals.recessed_light * 18 +
    totals.smoke_co * 25;

  const conduitFeet = Math.ceil(wireFeet * 0.45);
  const cableRuns = Math.max(1, Math.ceil(wireFeet / 250));

  return [
    {
      id: "mat-wire",
      projectId: "p-001",
      itemCode: "WIRE-12-2",
      description: "12/2 NM-B wire",
      unit: "ft",
      quantity: wireFeet
    },
    {
      id: "mat-conduit",
      projectId: "p-001",
      itemCode: "COND-EMT-1/2",
      description: "1/2 in EMT conduit",
      unit: "ft",
      quantity: conduitFeet
    },
    {
      id: "mat-runs",
      projectId: "p-001",
      itemCode: "RUN-CABLE",
      description: "Cable runs",
      unit: "ea",
      quantity: cableRuns
    },
    {
      id: "mat-boxes",
      projectId: "p-001",
      itemCode: "BOX-1G",
      description: "1-gang device boxes",
      unit: "ea",
      quantity: totals.outlet + totals.switch + totals.dimmer
    },
    {
      id: "mat-plates",
      projectId: "p-001",
      itemCode: "PLATE-1G",
      description: "1-gang wall plates",
      unit: "ea",
      quantity: totals.outlet + totals.switch + totals.dimmer
    },
    {
      id: "mat-devices",
      projectId: "p-001",
      itemCode: "DEV-COMBO",
      description: "Outlets/switches/dimmers",
      unit: "ea",
      quantity: totals.outlet + totals.switch + totals.dimmer
    },
    {
      id: "mat-fixtures",
      projectId: "p-001",
      itemCode: "FIXTURE-LGT",
      description: "Lights, recessed lights, and fans",
      unit: "ea",
      quantity: totals.light + totals.recessed_light + totals.fan
    }
  ];
}
