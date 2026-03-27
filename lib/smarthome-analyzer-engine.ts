/** Rule-based smart home / automation planning. */

/**
 * Product reference (verify MAP / dealer before quoting):
 * - Control4: Core 1 / 3 / 5, CA-10; SR-260 (no Siri), Halo (Siri), Halo Touch; T3 / T4 / T5 (soon); Chime; lighting lines; Connect subscription.
 * - Josh.ai: Josh One ~$769, X2 ~$1,538; Core ~$3,079, Core X2 ~$6,158; Micro / Nano endpoints; software plans monthly/yearly/5yr/lifetime.
 * - After 2026-04-21 ADI Josh↔C4 driver: Josh = voice service only in C4 (Micro/Nano) — not Josh touchscreens/app/remotes in C4. Josh standalone = full alternative.
 * - UniFi Protect: G5 Pro, G6 Pro; AI Multisensor 4; G4 Doorbell Pro; G6 Pro Entry; AI Pro; AI Theta 360.
 * - UniFi Access: UA Lite, UA Pro, UA Ultra (FP), UA Hub, UA Lock, UA Intercom, UA Elevator.
 * - Chowmain UniFi driver ~$150 — include in C4 + UniFi or Josh + UniFi BOMs.
 */
export const CONTROL4_CONNECT_ANNUAL_NOTE =
  "Control4 Connect ~$249/yr (est., optional for remote access — verify Snap One; not required for in-home control)";

export type ShBuildingType =
  | "new_construction"
  | "renovation"
  | "retrofit"
  | "commercial";

export type ShBudget =
  | "under_10k"
  | "10k_30k"
  | "30k_75k"
  | "75k_200k"
  | "200k_plus";

export type ShLifestyle =
  | "convenience"
  | "energy"
  | "security"
  | "entertainment"
  | "full_auto"
  | "commercial_control";

export type ShRoomType =
  | "living_room"
  | "bedroom"
  | "kitchen"
  | "office"
  | "hallway"
  | "basement"
  | "garage"
  | "outdoor"
  | "conference"
  | "lobby"
  | "other";

export type ShControlSystem =
  | "no_pref"
  | "homekit"
  | "google"
  | "alexa"
  | "home_assistant"
  | "control4"
  | "josh"
  | "urc"
  | "savant"
  | "crestron"
  | "lutron_homeworks";

export type ShLighting =
  | "no_pref"
  | "lutron_ra3"
  | "lutron_homeworks"
  | "lutron_caseta"
  | "leviton"
  | "c4_lighting"
  | "savant_lighting";

export type ShVoice =
  | "no_pref"
  | "josh"
  | "alexa"
  | "google"
  | "siri"
  | "c4_voice";

export type ShRoomInput = {
  id: string;
  name: string;
  roomType: ShRoomType;
  lightingControl: boolean;
  switchCount: number;
  motorizedShades: boolean;
  shadeCount: number;
  thermostat: boolean;
  avControl: boolean;
  doorLock: boolean;
  securitySensors: boolean;
  motionCount: number;
  doorWindowSensorCount: number;
  cameras: boolean;
  cameraIndoor: number;
  cameraOutdoor: number;
  voiceControl: boolean;
  touchscreenKeypad: boolean;
  occupancySensor: boolean;
};

export type ShInputs = {
  projectName: string;
  clientName: string;
  buildingType: ShBuildingType;
  totalSqFt: number;
  floors: number;
  budget: ShBudget;
  lifestyle: ShLifestyle;
  rooms: ShRoomInput[];
  controlSystem: ShControlSystem;
  lighting: ShLighting;
  voice: ShVoice;
};

export type ShSummary = {
  lightingPoints: number;
  shades: number;
  thermostats: number;
  cameras: number;
  locks: number;
  securitySensors: number;
  keypads: number;
  totalDevices: number;
};

export type ShTierColumn = {
  tier: "good" | "better" | "best";
  control: string;
  lighting: string;
  voice: string;
  hardwareCostRange: string;
  programmingHours: string;
  suitedFor: string;
  /** Driver / subscription lines for BOM-style proposals */
  driverBom: string;
};

export type ShRoomDeviceRow = {
  roomId: string;
  roomName: string;
  dimmers: number;
  shades: number;
  thermostat: string;
  keypad: string;
  camera: number;
  lock: string;
  sensors: number;
};

export type ShControllerRec = {
  title: string;
  why: string;
  model: string;
  qty: number;
  programmingHours: number;
  networkNotes: string;
  integrationNotes: string;
};

export type ShNetwork = {
  ipCameras: number;
  ipControllers: number;
  recommendedSwitchPorts: number;
  vlanNotes: string[];
};

export type ShResults = {
  summary: ShSummary;
  controller: ShControllerRec;
  tiers: ShTierColumn[];
  roomRows: ShRoomDeviceRow[];
  wiringBullets: string[];
  network: ShNetwork;
  wifiDeviceHint: { roomName: string; expectedDevices: number }[];
  summaryLines: string[];
  /** Shown on reports — network presence / welcome scenes */
  presenceDetectionProposalLine: string;
};

function sumRooms(rooms: ShRoomInput[], fn: (r: ShRoomInput) => number): number {
  return rooms.reduce((a, r) => a + fn(r), 0);
}

export function computeSmartHomePlan(inputs: ShInputs): ShResults {
  const lightingPoints = sumRooms(inputs.rooms, (r) =>
    r.lightingControl ? Math.max(1, r.switchCount) : 0,
  );
  const shades = sumRooms(inputs.rooms, (r) =>
    r.motorizedShades ? Math.max(1, r.shadeCount) : 0,
  );
  const thermostats = sumRooms(inputs.rooms, (r) => (r.thermostat ? 1 : 0));
  const cameras = sumRooms(inputs.rooms, (r) =>
    r.cameras ? r.cameraIndoor + r.cameraOutdoor : 0,
  );
  const locks = sumRooms(inputs.rooms, (r) => (r.doorLock ? 1 : 0));
  const securitySensors = sumRooms(inputs.rooms, (r) =>
    r.securitySensors ? r.motionCount + r.doorWindowSensorCount : 0,
  );
  const keypads = sumRooms(inputs.rooms, (r) =>
    r.touchscreenKeypad ? 1 : 0,
  );

  const totalDevices =
    lightingPoints +
    shades +
    thermostats +
    cameras +
    locks +
    securitySensors +
    keypads +
    sumRooms(inputs.rooms, (r) => (r.voiceControl ? 1 : 0)) +
    sumRooms(inputs.rooms, (r) => (r.occupancySensor ? 1 : 0)) +
    sumRooms(inputs.rooms, (r) => (r.avControl ? 1 : 0));

  const budgetOrder: ShBudget[] = [
    "under_10k",
    "10k_30k",
    "30k_75k",
    "75k_200k",
    "200k_plus",
  ];
  const bIdx = budgetOrder.indexOf(inputs.budget);

  const tiers: ShTierColumn[] = [
    {
      tier: "good",
      control:
        "Apple HomeKit / Alexa / Google Home; optional Caseta bridge",
      lighting: "Lutron Caseta PD-6WCL ~$59",
      voice: "Alexa or Google Assistant (native); Siri via HomeKit",
      hardwareCostRange: "$5k – $25k",
      programmingHours: "4 – 12 hrs",
      suitedFor: "Condos, small homes, DIY-friendly",
      driverBom:
        "If UniFi backbone + future Control4: budget Chowmain UniFi driver ~$150 (not included in good-tier hardware range)",
    },
    {
      tier: "better",
      control:
        "Control4 Core 1 / Core 3 / Core 5 (CA-10 for flagship estates)",
      lighting: "Lutron RadioRA3 RRD-6ND ~$89; C4 keypads (Regular / Contemporary / Lux)",
      voice:
        "Siri: Halo or Halo Touch only (not SR-260) · Alexa/Google native · Josh voice in C4 after Apr 21 2026 = Micro/Nano only (ADI driver)",
      hardwareCostRange: "$30k – $90k",
      programmingHours: "16 – 40 hrs",
      suitedFor: "Whole-home residential, dedicated AV rooms",
      driverBom:
        "Chowmain UniFi driver $150 (UniFi Protect + network presence in Control4)",
    },
    {
      tier: "best",
      control:
        "Control4 CA-10 + expansion or Savant SSC-class; Josh standalone as alternate full platform",
      lighting: "Lutron HomeWorks QSX ~$149+; C4 T3/T4 (T5 soon)",
      voice:
        "Halo / Halo Touch for Siri · Josh Micro/Nano (C4 voice service post Apr 2026) · Josh standalone = full Josh app / remotes / touchscreens",
      hardwareCostRange: "$100k – $300k+",
      programmingHours: "40 – 120+ hrs",
      suitedFor: "Estate, theater, Control4+Josh high-end, commercial",
      driverBom:
        "Chowmain UniFi driver $150 + Control4 Connect ~$249/yr optional · Josh standalone + UniFi: Chowmain UniFi driver for Josh · Home Assistant bridge for niche integrations",
    },
  ];

  let controller: ShControllerRec;
  if (bIdx <= 1) {
    controller = {
      title: "Good-fit controller",
      why: "Budget and device count favor consumer or prosumer platforms with lower programming overhead.",
      model:
        inputs.controlSystem === "homekit"
          ? "Apple Home hub + bridges"
          : "Alexa/Google + Lutron Caseta Smart Bridge",
      qty: 1,
      programmingHours: 6 + Math.ceil(totalDevices / 20),
      networkNotes: "Solid Wi‑Fi coverage; segregate IoT where possible.",
      integrationNotes:
        "UniFi Protect options: G5 Pro / G6 Pro, AI Multisensor 4, G4 Doorbell Pro, G6 Pro Entry, AI Pro, AI Theta (360). Consumer mesh (eero/Orbi/Google) not recommended for pro installs.",
    };
  } else if (bIdx <= 3) {
    controller = {
      title: "Professional integrated controller",
      why: "Device density and lifestyle priority warrant a centralized control processor.",
      model:
        "Control4 Core 3 ~$1,199 (typical) — Core 1 smaller jobs · Core 5 / CA-10 large",
      qty: 1,
      programmingHours: 24 + Math.ceil(totalDevices / 8),
      networkNotes:
        "Wired backbone; PoE for T3/T4 touchscreens, Chime doorbell, keypads.",
      integrationNotes:
        "Control4 + UniFi: Chowmain UniFi driver ~$150 (BOM). Remotes: SR-260 (no Siri), Halo / Halo Touch (Siri). C4 Chime video doorbell. UniFi Access: UA Lite/Pro/Ultra, UA Hub, Lock, Intercom, Elevator. After Apr 21 2026 Josh↔C4 ADI driver: Josh Micro/Nano voice-only in C4 — not Josh touchscreens/app in C4.",
    };
  } else {
    controller = {
      title: "Flagship control platform",
      why: "Large footprint and automation scope need redundant processing and lighting-grade infrastructure.",
      model:
        "Control4 CA-10 ~$2,499+ or Savant SSC-1 ~$1,999 · Josh standalone: Core / Core X2 with full Josh ecosystem",
      qty: 1,
      programmingHours: 60 + Math.ceil(totalDevices / 5),
      networkNotes: "Managed switches, VLANs for AV / automation / guest.",
      integrationNotes:
        "Josh.ai hardware: Josh One ~$769, X2 ~$1,538; Core ~$3,079, Core X2 ~$6,158 — software monthly/yearly/5yr/lifetime. Josh standalone competes as full C4 alternative; present separately when voice-first. Home Assistant bridge for obscure integrations. HomeWorks QSX where specified.",
    };
  }

  if (inputs.controlSystem === "josh") {
    controller.model +=
      " · Josh Micro / Nano endpoints · Josh One / Core lines for standalone";
  }
  if (inputs.controlSystem === "urc") {
    controller.model = "URC MRX-10 ~$1,499 (typical)";
  }
  if (inputs.controlSystem === "savant" && bIdx > 1) {
    controller.model = "Savant SSC-1 ~$1,999 (typical host)";
  }
  if (inputs.controlSystem === "crestron" || inputs.buildingType === "commercial") {
    controller.model = "Crestron CP4-R ~$4,999 (design-dependent)";
    controller.programmingHours += 20;
  }

  const roomRows: ShRoomDeviceRow[] = inputs.rooms.map((r) => ({
    roomId: r.id,
    roomName: r.name,
    dimmers: r.lightingControl ? r.switchCount : 0,
    shades: r.motorizedShades ? r.shadeCount : 0,
    thermostat: r.thermostat ? "Yes" : "—",
    keypad: r.touchscreenKeypad ? "Yes" : "—",
    camera: r.cameras ? r.cameraIndoor + r.cameraOutdoor : 0,
    lock: r.doorLock ? "Yes" : "—",
    sensors: r.securitySensors
      ? r.motionCount + r.doorWindowSensorCount
      : 0,
  }));

  const wiringBullets = [
    "Low-voltage homerun for keypads / touchpanels (Cat6 recommended)",
    `Cat6 to each IP camera location (${cameras} camera runs)`,
    "18/2 or manufacturer-spec for line-voltage thermostat interfaces where required",
    "Dedicated 20A circuits for rack / processor locations (coordinate with electrical)",
    `PoE budget: plan for ${cameras + keypads + 4} powered devices minimum`,
  ];

  const ipControllers = 1 + Math.ceil(keypads / 4);
  const recommendedSwitchPorts = Math.ceil(
    (cameras + ipControllers + 8) * 1.25,
  );

  const network: ShNetwork = {
    ipCameras: cameras,
    ipControllers,
    recommendedSwitchPorts,
    vlanNotes: [
      "Automation VLAN — controllers, touchpanels, lighting bridges",
      "Camera VLAN — NVR / cameras, no direct internet where policy requires",
      "Guest VLAN — isolated from automation and surveillance",
    ],
  };

  const wifiDeviceHint = inputs.rooms.map((r) => {
    let d = 4;
    if (r.cameras) d += r.cameraIndoor + r.cameraOutdoor;
    if (r.voiceControl) d += 2;
    if (r.lightingControl) d += Math.min(4, r.switchCount);
    if (r.avControl) d += 6;
    return { roomName: r.name, expectedDevices: d };
  });

  const presenceDetectionProposalLine =
    "Network presence detection enables automatic welcome scenes when you arrive home via the Chowmain UniFi driver (Control4 or Josh + UniFi deployments).";

  const summaryLines = [
    `${inputs.projectName} · ${inputs.buildingType.replace(/_/g, " ")} · ${inputs.totalSqFt.toLocaleString()} sq ft`,
    `Budget: ${inputs.budget.replace(/_/g, " ")} · Priority: ${inputs.lifestyle.replace(/_/g, " ")}`,
    `Lighting points: ${lightingPoints} · Shades: ${shades} · Thermostats: ${thermostats}`,
    `Cameras: ${cameras} · Locks: ${locks} · Sensors: ${securitySensors} · Keypads: ${keypads}`,
    `Total controlled devices (rolled up): ${totalDevices}`,
    presenceDetectionProposalLine,
    CONTROL4_CONNECT_ANNUAL_NOTE,
    "Wi‑Fi 7 recommended for new construction, Control4/Josh, theaters, 50+ devices — UniFi U7 or Access Networks / Ruckus Wi‑Fi 7.",
  ];

  return {
    summary: {
      lightingPoints,
      shades,
      thermostats,
      cameras,
      locks,
      securitySensors,
      keypads,
      totalDevices,
    },
    controller,
    tiers,
    roomRows,
    wiringBullets,
    network,
    wifiDeviceHint,
    summaryLines,
    presenceDetectionProposalLine,
  };
}
