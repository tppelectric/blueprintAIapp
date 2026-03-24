/** Rule-based Audio/Video planning for residential & commercial. */

export type AvBuildingType =
  | "residential"
  | "commercial"
  | "restaurant"
  | "retail"
  | "house_of_worship"
  | "education"
  | "hospitality"
  | "other";

export type AvBudgetTier =
  | "under_5k"
  | "5k_15k"
  | "15k_50k"
  | "50k_150k"
  | "150k_plus";

export type AvPrimaryFocus =
  | "distributed_audio"
  | "home_theater"
  | "both_av"
  | "commercial_av"
  | "outdoor_entertainment";

export type AvRoomType =
  | "living_room"
  | "master_bedroom"
  | "bedroom"
  | "kitchen"
  | "dining_room"
  | "office"
  | "home_theater"
  | "media_room"
  | "basement"
  | "patio"
  | "pool_area"
  | "outdoor"
  | "conference_room"
  | "boardroom"
  | "restaurant"
  | "bar"
  | "lobby"
  | "other";

export type AvPrimaryUse =
  | "background_music"
  | "critical_listening"
  | "home_theater_use"
  | "video_conferencing"
  | "commercial_music"
  | "outdoor_entertainment_use"
  | "multi_purpose";

export type AvCeilingType =
  | "standard_flat"
  | "vaulted"
  | "cathedral"
  | "coffered"
  | "exposed_beam"
  | "drop_ceiling";

export type AvCeilingHeight = "8" | "9" | "10" | "12" | "14" | "higher";

export type AvAcousticTreatment =
  | "none"
  | "some_soft"
  | "treated"
  | "dedicated_theater";

export type AvDisplayPref =
  | "no_pref"
  | "tv_preferred"
  | "projector_preferred";

export type AvAmbientLight =
  | "very_dark"
  | "dark"
  | "moderate"
  | "bright"
  | "very_bright"
  | "outdoor";

export type AvAudioBrand =
  | "no_pref"
  | "sonos"
  | "sonance"
  | "origin"
  | "james"
  | "klipsch"
  | "polk"
  | "triad"
  | "leon"
  | "qsc"
  | "bose_commercial"
  | "jbl_commercial";

export type AvVideoBrand =
  | "no_pref"
  | "samsung"
  | "lg"
  | "sony_tv"
  | "epson"
  | "benq"
  | "sony_proj"
  | "jvc"
  | "lg_oled"
  | "samsung_qd_oled"
  | "sony_oled";

export type AvDistribution =
  | "no_pref"
  | "sonos"
  | "control4"
  | "savant"
  | "avr_standalone"
  | "commercial_distributed";

export type AvRoomInput = {
  id: string;
  name: string;
  floor: number;
  lengthFt: number;
  widthFt: number;
  roomType: AvRoomType;
  primaryUse: AvPrimaryUse;
  ceilingType: AvCeilingType;
  ceilingHeight: AvCeilingHeight;
  acousticTreatment: AvAcousticTreatment;
  seats: number;
  displayNeeded: boolean;
  displayPref: AvDisplayPref;
  ambientLight: AvAmbientLight;
};

export type AvAvInputs = {
  projectName: string;
  clientName: string;
  buildingType: AvBuildingType;
  totalSqFt: number;
  floors: number;
  budget: AvBudgetTier;
  primaryFocus: AvPrimaryFocus;
  rooms: AvRoomInput[];
  audioBrand: AvAudioBrand;
  videoBrand: AvVideoBrand;
  distribution: AvDistribution;
};

export type AvRoomPlanRow = {
  roomId: string;
  roomName: string;
  floor: number;
  sqFt: number;
  speakerSizeNote: string;
  speakerQty: number;
  displaySizeIn: number | null;
  displayTypeNote: string;
  speakerWireNote: string;
  videoWireNote: string;
  zone: string;
};

export type AvTierEstimate = {
  id: "good" | "better" | "best";
  label: string;
  speakersNote: string;
  displaysNote: string;
  distributionNote: string;
  ampNote: string;
  costRange: string;
  popular?: boolean;
};

export type AvMaterialsRollup = {
  speakers525: number;
  speakers65: number;
  speakers8: number;
  outdoorPairs: number;
  displays: { inches: number; qty: number }[];
  projectorQty: number;
  speakerWire16Lf: number;
  speakerWire14Lf: number;
  speakerWire12Lf: number;
  hdmiLf: number;
  cat6Lf: number;
  hdbasetKits: number;
  lvBrackets: number;
  volumeControls: number;
  avReceivers: number;
  sonosAmps: number;
  multiZoneAmps: number;
};

export type AvResults = {
  roomRows: AvRoomPlanRow[];
  roomsWithAudio: number;
  roomsWithVideo: number;
  totalSpeakers: number;
  totalDisplays: number;
  ampZones: number;
  recommendedDistribution: string;
  tiers: AvTierEstimate[];
  materials: AvMaterialsRollup;
  amplificationNote: string;
  summaryLines: string[];
};

function roomSqFt(r: AvRoomInput): number {
  return Math.max(0, r.lengthFt) * Math.max(0, r.widthFt);
}

function speakerSizeForSqFt(sq: number): string {
  if (sq < 100) return `5.25" in-ceiling`;
  if (sq < 200) return `6.5" in-ceiling`;
  if (sq < 400) return `8" in-ceiling`;
  if (sq < 600) return `8" dual or LCR + surrounds`;
  return "Multiple zones / large-format";
}

function isOutdoorish(t: AvRoomType): boolean {
  return (
    t === "patio" ||
    t === "pool_area" ||
    t === "outdoor" ||
    t === "bar"
  );
}

function isTheaterish(t: AvRoomType, use: AvPrimaryUse): boolean {
  return (
    t === "home_theater" ||
    t === "media_room" ||
    use === "home_theater_use"
  );
}

function isBedOrOffice(t: AvRoomType): boolean {
  return (
    t === "bedroom" ||
    t === "master_bedroom" ||
    t === "office"
  );
}

function isLiving(t: AvRoomType): boolean {
  return t === "living_room" || t === "lobby";
}

function isRestaurantCommercial(t: AvRoomType, building: AvBuildingType): boolean {
  return (
    t === "restaurant" ||
    t === "bar" ||
    building === "restaurant" ||
    building === "retail" ||
    building === "hospitality"
  );
}

/** Viewing distance heuristic (ft) from seats and room size. */
function viewingDistanceFt(r: AvRoomInput): number {
  const L = Math.max(1, r.lengthFt);
  const W = Math.max(1, r.widthFt);
  const maxDim = Math.max(L, W);
  if (isTheaterish(r.roomType, r.primaryUse)) {
    return Math.min(Math.max(maxDim * 0.75, 8), 20);
  }
  return Math.min(Math.max(maxDim * 0.55, 6), 16);
}

/**
 * Spec text uses ×0.84; that yields unrealistic inches for typical distances.
 * Use THX-style: diagonal ≈ (viewing distance in inches) / 1.75.
 */
function recommendedDisplayInches(viewingFt: number): number {
  const vdIn = viewingFt * 12;
  return Math.max(43, Math.min(200, Math.round(vdIn / 1.75)));
}

function displayTvVsProjector(
  inches: number,
  ambient: AvAmbientLight,
  pref: AvDisplayPref,
): string {
  if (pref === "projector_preferred") return "Projector recommended";
  if (pref === "tv_preferred") return "TV recommended";
  if (
    ambient === "very_bright" ||
    ambient === "bright" ||
    ambient === "outdoor"
  ) {
    return inches >= 85 ? "Bright room — large TV or high-brightness projector" : "TV recommended";
  }
  if (inches < 85) return "TV recommended";
  if (inches <= 110) return "TV or projector";
  return "Projector recommended";
}

function speakerQtyForRoom(
  r: AvRoomInput,
  sq: number,
  building: AvBuildingType,
): number {
  if (isTheaterish(r.roomType, r.primaryUse)) return 8;
  if (isOutdoorish(r.roomType)) {
    const n = Math.ceil(sq / 250);
    return Math.max(2, n);
  }
  if (isRestaurantCommercial(r.roomType, building)) {
    return Math.max(2, Math.ceil(sq / 200));
  }
  if (isBedOrOffice(r.roomType)) return 2;
  if (isLiving(r.roomType)) {
    if (sq < 300) return 2;
    if (sq <= 500) return 4;
    return 6;
  }
  if (sq < 120) return 2;
  if (sq < 350) return 4;
  return 6;
}

function estSpeakerRunFt(r: AvRoomInput): number {
  const diag = Math.sqrt(
    Math.max(1, r.lengthFt) ** 2 + Math.max(1, r.widthFt) ** 2,
  );
  return Math.max(25, Math.min(120, diag * 1.1 + 15));
}

function wireForRun(runFt: number): { sp: string; note: string } {
  if (runFt < 30) return { sp: "16/2 CL2", note: "16/2 CL2 (runs under ~30 ft)" };
  if (runFt <= 75) return { sp: "14/2 CL2", note: "14/2 CL2 (standard)" };
  return { sp: "12/2 CL2", note: "12/2 CL2 (long runs)" };
}

function videoWireNote(display: boolean, runFt: number): string {
  if (!display) return "—";
  if (runFt < 25) return "HDMI 2.1 (<25 ft typical)";
  return "HDBaseT over Cat6 (>25 ft)";
}

function distributionLabel(d: AvDistribution): string {
  switch (d) {
    case "sonos":
      return "Sonos ecosystem";
    case "control4":
      return "Control4 integrated";
    case "savant":
      return "Savant integrated";
    case "avr_standalone":
      return "Standalone AV receiver";
    case "commercial_distributed":
      return "Commercial distributed audio";
    default:
      return "Match tier — Sonos / Sonance / Control4 based on scope";
  }
}

function ampZonesFromRooms(rows: AvRoomPlanRow[]): number {
  const zones = new Set(rows.map((x) => x.zone));
  return Math.max(1, zones.size);
}

export function computeAvPlan(inputs: AvAvInputs): AvResults {
  const roomRows: AvRoomPlanRow[] = [];
  let totalSpeakers = 0;
  let roomsWithAudio = 0;
  let roomsWithVideo = 0;
  let zoneCounter = 0;

  let sp16 = 0;
  let sp14 = 0;
  let sp12 = 0;
  let outdoorPairs = 0;
  const displayList: { inches: number; qty: number }[] = [];
  let projectorRecs = 0;
  let hdmiLf = 0;
  let cat6Lf = 0;
  let hdbaseT = 0;
  let lvBrackets = 0;

  for (const r of inputs.rooms) {
    const sq = roomSqFt(r);
    const qty = speakerQtyForRoom(r, sq, inputs.buildingType);
    const sizeNote = speakerSizeForSqFt(sq);
    zoneCounter += 1;
    const zone = `Z${zoneCounter}`;

    const runFt = estSpeakerRunFt(r);
    const spWire = wireForRun(runFt);
    for (let i = 0; i < Math.ceil(qty / 2); i++) {
      if (spWire.sp.startsWith("16")) sp16 += runFt;
      else if (spWire.sp.startsWith("14")) sp14 += runFt;
      else sp12 += runFt;
    }
    lvBrackets += qty;

    let displayIn: number | null = null;
    let dispNote = "—";
    if (r.displayNeeded) {
      roomsWithVideo += 1;
      const vd = viewingDistanceFt(r);
      displayIn = recommendedDisplayInches(vd);
      dispNote = displayTvVsProjector(displayIn, r.ambientLight, r.displayPref);
      if (dispNote.includes("Projector")) projectorRecs += 1;
      displayList.push({ inches: displayIn, qty: 1 });
      const vNote = videoWireNote(true, runFt);
      if (vNote.includes("HDMI")) hdmiLf += Math.min(runFt, 25);
      else {
        cat6Lf += runFt;
        hdbaseT += 1;
      }
    }

    if (qty > 0) roomsWithAudio += 1;
    totalSpeakers += qty;
    if (isOutdoorish(r.roomType)) outdoorPairs += Math.max(1, Math.ceil(qty / 2));

    roomRows.push({
      roomId: r.id,
      roomName: r.name,
      floor: r.floor,
      sqFt: Math.round(sq),
      speakerSizeNote: sizeNote,
      speakerQty: qty,
      displaySizeIn: displayIn,
      displayTypeNote: dispNote,
      speakerWireNote: spWire.note,
      videoWireNote: videoWireNote(r.displayNeeded, runFt),
      zone,
    });
  }

  const ampZones = ampZonesFromRooms(roomRows);
  const recommendedDistribution =
    inputs.distribution === "no_pref"
      ? distributionLabel("sonos")
      : distributionLabel(inputs.distribution);

  const ampNote =
    ampZones <= 2
      ? "Receiver or Sonos Amp (~$699/zone typical)"
      : ampZones <= 6
        ? "Sonance SA-series or multi-zone amps"
        : ampZones <= 12
          ? "Autonomic / rack multi-zone"
          : "Commercial QSC or Crown distributed";

  const tiers: AvTierEstimate[] = [
    {
      id: "good",
      label: "Good (budget)",
      speakersNote:
        "Polk 80F/X-LS ~$89/ea · Klipsch CDT-5800-C II 8\" ~$179/ea",
      displaysNote: "Samsung QN85B QLED · LG C3 OLED (sizing per room)",
      distributionNote: "Sonos Era 100 / Era 300 + Sonos Amp + Port (as needed)",
      ampNote: "Sonos Amp (~$699) or AV receiver",
      costRange: "$8k – $25k installed (typical resi, varies)",
    },
    {
      id: "better",
      label: "Better (standard)",
      speakersNote:
        "Sonance SA Series (e.g. SA-1750) · Origin Director D83 8\" ~$279/ea",
      displaysNote: "Samsung QN85B · LG G3 OLED gallery · Sony A80K OLED",
      distributionNote: "Sonos Amp + Era 300 zones; Sonance SA multi-zone amps",
      ampNote: "Sonance SA series / Sonos Amp stacks",
      costRange: "$25k – $75k installed (typical)",
      popular: true,
    },
    {
      id: "best",
      label: "Best (premium)",
      speakersNote:
        "Origin Director D103 10\" ~$399/ea · James Architectural · Triad custom",
      displaysNote:
        "Sony A95K QD-OLED · Epson LS800 UST ~$3,999 · BenQ TK860i ~$1,299 · Sony VPL-XW5000ES ~$5,999 · JVC NZ7 ~$5,499",
      distributionNote: "Control4 or Savant video matrix + DSP",
      ampNote: "Triad / QSC AD-C6T (~$299) / Bose FreeSpace DS 40F (~$299) as spec",
      costRange: "$75k – $200k+ installed (typical)",
    },
  ];

  let c525 = 0;
  let c65 = 0;
  let c8 = 0;
  for (const row of roomRows) {
    const q = row.speakerQty;
    if (row.speakerSizeNote.includes("5.25")) c525 += q;
    else if (row.speakerSizeNote.includes("6.5")) c65 += q;
    else if (row.speakerSizeNote.includes("8")) c8 += q;
    else c8 += q;
  }

  const materials: AvMaterialsRollup = {
    speakers525: c525,
    speakers65: c65,
    speakers8: c8,
    outdoorPairs,
    displays: displayList,
    projectorQty: projectorRecs,
    speakerWire16Lf: Math.round(sp16),
    speakerWire14Lf: Math.round(sp14),
    speakerWire12Lf: Math.round(sp12),
    hdmiLf: Math.round(hdmiLf),
    cat6Lf: Math.round(cat6Lf),
    hdbasetKits: hdbaseT,
    lvBrackets,
    volumeControls: ampZones,
    avReceivers: ampZones <= 2 ? 1 : 0,
    sonosAmps: inputs.distribution === "sonos" ? Math.min(ampZones, 6) : 0,
    multiZoneAmps: ampZones > 2 ? 1 : 0,
  };

  const summaryLines = [
    `Building: ${inputs.buildingType.replace(/_/g, " ")} · ${inputs.totalSqFt.toLocaleString()} sq ft · ${inputs.floors} floor(s)`,
    `Budget tier: ${inputs.budget.replace(/_/g, " ")} · Focus: ${inputs.primaryFocus.replace(/_/g, " ")}`,
    `Rooms with audio: ${roomsWithAudio} · Rooms with video: ${roomsWithVideo}`,
    `Total speakers: ${totalSpeakers} · Displays: ${roomsWithVideo} · Amplification zones: ${ampZones}`,
    `Recommended distribution: ${recommendedDistribution}`,
    ampNote,
  ];

  return {
    roomRows,
    roomsWithAudio,
    roomsWithVideo,
    totalSpeakers,
    totalDisplays: roomsWithVideo,
    ampZones,
    recommendedDistribution,
    tiers,
    materials,
    amplificationNote: ampNote,
    summaryLines,
  };
}
