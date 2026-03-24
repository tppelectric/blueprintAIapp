/** Rule-based smart home / automation planning. */

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
      control: "Apple HomeKit or Amazon Alexa",
      lighting: "Lutron Caseta",
      voice: "Alexa or Google Assistant",
      hardwareCostRange: "$5k – $25k",
      programmingHours: "4 – 12 hrs",
      suitedFor: "Condos, small homes, DIY-friendly",
    },
    {
      tier: "better",
      control: "Control4 EA-1 or EA-3",
      lighting: "Lutron RadioRA 3",
      voice: "Josh.ai or Control4 voice",
      hardwareCostRange: "$30k – $90k",
      programmingHours: "16 – 40 hrs",
      suitedFor: "Whole-home residential, dedicated AV rooms",
    },
    {
      tier: "best",
      control: "Control4 CA-10 or Savant",
      lighting: "Lutron HomeWorks QSX",
      voice: "Josh.ai",
      hardwareCostRange: "$100k – $300k+",
      programmingHours: "40 – 120+ hrs",
      suitedFor: "Estate, commercial, mission-critical",
    },
  ];

  let controller: ShControllerRec;
  if (bIdx <= 1) {
    controller = {
      title: "Good-fit controller",
      why: "Budget and device count favor consumer or prosumer platforms with lower programming overhead.",
      model: inputs.controlSystem === "homekit" ? "Apple Home hub + bridges" : "Alexa/Google + Caseta bridge",
      qty: 1,
      programmingHours: 6 + Math.ceil(totalDevices / 20),
      networkNotes: "Solid Wi‑Fi coverage; segregate IoT where possible.",
      integrationNotes: "Verify cloud API limits for locks and cameras.",
    };
  } else if (bIdx <= 3) {
    controller = {
      title: "Professional integrated controller",
      why: "Device density and lifestyle priority warrant a centralized control processor.",
      model: "Control4 EA-3 (typical) — scale to EA-5 for video walls",
      qty: 1,
      programmingHours: 24 + Math.ceil(totalDevices / 8),
      networkNotes: "Wired backbone recommended; PoE for touchpanels and keypads.",
      integrationNotes: "RadioRA 3 / Control4 lighting sync; AV zones tie-in.",
    };
  } else {
    controller = {
      title: "Flagship control platform",
      why: "Large footprint and automation scope need redundant processing and lighting-grade infrastructure.",
      model: "Savant host or Control4 CA-10 + expansion",
      qty: 1,
      programmingHours: 60 + Math.ceil(totalDevices / 5),
      networkNotes: "Managed switches, VLANs for AV / automation / guest.",
      integrationNotes: "HomeWorks QSX for lighting; Josh.ai for voice layer.",
    };
  }

  if (inputs.controlSystem === "crestron" || inputs.buildingType === "commercial") {
    controller.model = "Crestron CP4 / VC-4 (design-dependent)";
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

  const summaryLines = [
    `${inputs.projectName} · ${inputs.buildingType.replace(/_/g, " ")} · ${inputs.totalSqFt.toLocaleString()} sq ft`,
    `Budget: ${inputs.budget.replace(/_/g, " ")} · Priority: ${inputs.lifestyle.replace(/_/g, " ")}`,
    `Lighting points: ${lightingPoints} · Shades: ${shades} · Thermostats: ${thermostats}`,
    `Cameras: ${cameras} · Locks: ${locks} · Sensors: ${securitySensors} · Keypads: ${keypads}`,
    `Total controlled devices (rolled up): ${totalDevices}`,
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
  };
}
