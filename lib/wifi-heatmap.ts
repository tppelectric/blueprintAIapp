import type {
  RoomWallMaterial,
  WifiAnalyzerInputs,
  WifiAnalyzerResults,
} from "@/lib/wifi-analyzer-engine";

export type HeatMapMarker = {
  id: string;
  /** 0–1 within blueprint (or grid) content box */
  nx: number;
  ny: number;
  kind: "indoor" | "outdoor";
  /** Display index (1-based) */
  label: number;
};

export type HeatMapRoomZoneTier = "strong" | "good" | "marginal" | "poor";

/** Room rectangle in normalized coordinates (full canvas) when no PDF is loaded. */
export type HeatMapLayoutRoom = {
  id: string;
  name: string;
  sqFt: number;
  floor: number;
  outdoor: boolean;
  nx: number;
  ny: number;
  nw: number;
  nh: number;
};

/**
 * Proportional room tiles by floor (highest floor at top, floor 1 lower, outdoor bottom).
 */
export function buildHeatMapRoomLayoutNorm(
  inputs: WifiAnalyzerInputs,
): HeatMapLayoutRoom[] {
  const rooms = inputs.rooms ?? [];
  const complete = rooms.filter((r) => isRoomCompleteLike(r));
  if (!complete.length) return [];

  const pad = 0.05;
  const W = 1 - 2 * pad;
  const H = 1 - 2 * pad;

  const indoor = complete.filter((r) => !r.outdoor);
  const outdoor = complete.filter((r) => r.outdoor);
  const totalArea = complete.reduce(
    (s, r) => s + Math.max(0, r.lengthFt) * Math.max(0, r.widthFt),
    0,
  );
  if (totalArea <= 0) return [];

  const floors = [...new Set(indoor.map((r) => r.floor))].sort((a, b) => b - a);

  type Seg =
    | { tag: "indoor"; floor: number; rooms: typeof complete }
    | { tag: "outdoor"; rooms: typeof complete };
  const segments: Seg[] = [];
  for (const f of floors) {
    const fr = indoor.filter((r) => r.floor === f);
    if (fr.length) segments.push({ tag: "indoor", floor: f, rooms: fr });
  }
  if (outdoor.length) segments.push({ tag: "outdoor", rooms: outdoor });

  const out: HeatMapLayoutRoom[] = [];
  let y = pad;

  for (const seg of segments) {
    const floorArea = seg.rooms.reduce(
      (s, r) => s + Math.max(0, r.lengthFt) * Math.max(0, r.widthFt),
      0,
    );
    const bandH = (floorArea / totalArea) * H;
    const sortedRooms = [...seg.rooms].sort(
      (a, b) => b.lengthFt * b.widthFt - a.lengthFt * a.widthFt,
    );
    let x = pad;
    for (const room of sortedRooms) {
      const area = Math.max(0, room.lengthFt) * Math.max(0, room.widthFt);
      const rw = (area / floorArea) * W;
      const nh = bandH * 0.88;
      const vOff = (bandH - nh) / 2;
      const gap = rw * 0.02;
      out.push({
        id: room.id,
        name: room.name.trim() || "Room",
        sqFt: Math.round(area),
        floor: seg.tag === "outdoor" ? 0 : seg.floor,
        outdoor: seg.tag === "outdoor",
        nx: x + gap / 2,
        ny: y + vOff,
        nw: Math.max(0.02, rw - gap),
        nh,
      });
      x += rw;
    }
    y += bandH;
  }

  return out;
}

function isRoomCompleteLike(r: {
  name: string;
  lengthFt: number;
  widthFt: number;
}): boolean {
  return (
    Boolean(r.name?.trim()) && r.lengthFt > 0 && r.widthFt > 0
  );
}

/** Coverage radius (feet) by wall type — heat map visualization. */
export function coverageRadiusFtFromWall(w: RoomWallMaterial): number {
  switch (w) {
    case "drywall":
      return 50;
    case "plaster":
      return 45;
    case "brick":
      return 30;
    case "concrete_block":
      return 25;
    case "mixed":
      return 35;
    default:
      return 45;
  }
}

export function averageIndoorCoverageRadiusFt(
  inputs: WifiAnalyzerInputs,
): number {
  const indoor = (inputs.rooms ?? []).filter(
    (r) => isRoomCompleteLike(r) && !r.outdoor,
  );
  if (indoor.length === 0) return 45;
  let s = 0;
  for (const r of indoor) {
    s += coverageRadiusFtFromWall(r.wallMaterial);
  }
  let avg = s / indoor.length;
  if (inputs.buildingAge === "pre_1980") avg *= 0.9;
  return avg;
}

function newMarkerId() {
  return `hm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Initial AP marker positions from zone map: primary/largest rooms first,
 * then grid fill. Outdoor APs along lower band.
 */
export function suggestWifiHeatMapMarkers(
  inputs: WifiAnalyzerInputs,
  results: WifiAnalyzerResults,
  hasBlueprint: boolean,
): HeatMapMarker[] {
  const indoor = results.indoorAps;
  const outdoor = results.outdoorAps;
  const markers: HeatMapMarker[] = [];

  const primaryIndoor = results.roomRows
    .filter(
      (row) =>
        row.complete &&
        !row.outdoor &&
        row.zoneType === "Primary coverage zone",
    )
    .sort((a, b) => b.areaSqFt - a.areaSqFt);

  const otherIndoor = results.roomRows
    .filter(
      (row) =>
        row.complete &&
        !row.outdoor &&
        row.zoneType !== "Primary coverage zone",
    )
    .sort((a, b) => b.areaSqFt - a.areaSqFt);

  const orderedRooms = [...primaryIndoor, ...otherIndoor];

  const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, indoor))));
  const rows = Math.max(1, Math.ceil(indoor / cols));

  const layoutNorm = buildHeatMapRoomLayoutNorm(inputs);
  const indoorLayoutCenters = layoutNorm
    .filter((r) => !r.outdoor)
    .sort((a, b) => b.sqFt - a.sqFt)
    .map((r) => ({
      nx: Math.min(0.97, Math.max(0.03, r.nx + r.nw / 2)),
      ny: Math.min(0.97, Math.max(0.03, r.ny + r.nh / 2)),
    }));
  const outdoorLayoutCenters = layoutNorm
    .filter((r) => r.outdoor)
    .sort((a, b) => b.sqFt - a.sqFt)
    .map((r) => ({
      nx: Math.min(0.97, Math.max(0.03, r.nx + r.nw / 2)),
      ny: Math.min(0.97, Math.max(0.03, r.ny + r.nh / 2)),
    }));

  for (let i = 0; i < indoor; i++) {
    let nx: number;
    let ny: number;
    if (hasBlueprint) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      nx = 0.12 + ((col + 0.5) / cols) * 0.76;
      ny = 0.14 + ((row + 0.5) / rows) * 0.62;
      if (orderedRooms[i]) {
        const hash =
          (orderedRooms[i].name.length * 17 + orderedRooms[i].floor * 31 + i * 13) %
          1000;
        nx += (hash / 1000 - 0.5) * 0.06;
        ny += (((hash * 7) % 1000) / 1000 - 0.5) * 0.06;
        nx = Math.min(0.92, Math.max(0.08, nx));
        ny = Math.min(0.88, Math.max(0.1, ny));
      }
    } else if (indoorLayoutCenters[i] !== undefined) {
      nx = indoorLayoutCenters[i].nx;
      ny = indoorLayoutCenters[i].ny;
    } else {
      const col = i % cols;
      const row = Math.floor(i / cols);
      nx = 0.08 + ((col + 0.5) / cols) * 0.84;
      ny = 0.1 + ((row + 0.5) / rows) * 0.72;
    }
    markers.push({
      id: newMarkerId(),
      nx,
      ny,
      kind: "indoor",
      label: i + 1,
    });
  }

  for (let j = 0; j < outdoor; j++) {
    let nx: number;
    let ny: number;
    if (hasBlueprint) {
      nx = outdoor <= 1 ? 0.5 : 0.2 + (j / Math.max(1, outdoor - 1)) * 0.6;
      ny = 0.88;
    } else if (outdoorLayoutCenters[j] !== undefined) {
      nx = outdoorLayoutCenters[j].nx;
      ny = outdoorLayoutCenters[j].ny;
    } else {
      nx = outdoor <= 1 ? 0.5 : 0.2 + (j / Math.max(1, outdoor - 1)) * 0.6;
      ny = 0.86;
    }
    markers.push({
      id: newMarkerId(),
      nx,
      ny,
      kind: "outdoor",
      label: j + 1,
    });
  }

  return markers;
}

export type BlueprintLayoutRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** object-fit: contain image in cw×ch */
export function blueprintContainRect(
  cw: number,
  ch: number,
  imgW: number,
  imgH: number,
): BlueprintLayoutRect {
  const ir = imgW / Math.max(1, imgH);
  const cr = cw / Math.max(1, ch);
  let w: number;
  let h: number;
  if (ir > cr) {
    w = cw;
    h = cw / ir;
  } else {
    h = ch;
    w = ch * ir;
  }
  const x = (cw - w) / 2;
  const y = (ch - h) / 2;
  return { x, y, w, h };
}

function markerCanvasXY(
  m: HeatMapMarker,
  rect: BlueprintLayoutRect,
): { x: number; y: number } {
  return {
    x: rect.x + m.nx * rect.w,
    y: rect.y + m.ny * rect.h,
  };
}

function zoneTierFromMarkerDistance(
  distPx: number,
  rStrongPx: number,
): HeatMapRoomZoneTier {
  if (!Number.isFinite(distPx) || distPx === Infinity) return "poor";
  if (distPx < rStrongPx * 0.38) return "strong";
  if (distPx < rStrongPx * 0.72) return "good";
  if (distPx < rStrongPx * 1.05) return "marginal";
  return "poor";
}

function minDistToKindPx(
  cx: number,
  cy: number,
  markers: HeatMapMarker[],
  rect: BlueprintLayoutRect,
  kind: "indoor" | "outdoor",
): number {
  let d = Infinity;
  for (const m of markers) {
    if (m.kind !== kind) continue;
    const { x, y } = markerCanvasXY(m, rect);
    const dist = Math.hypot(cx - x, cy - y);
    if (dist < d) d = dist;
  }
  return d;
}

function roomZoneTierFromMarkers(
  room: HeatMapLayoutRoom,
  markers: HeatMapMarker[],
  rect: BlueprintLayoutRect,
  rStrongPx: number,
  cw: number,
  ch: number,
): HeatMapRoomZoneTier {
  const rcx = (room.nx + room.nw / 2) * cw;
  const rcy = (room.ny + room.nh / 2) * ch;
  const kind = room.outdoor ? "outdoor" : "indoor";
  const dist = minDistToKindPx(rcx, rcy, markers, rect, kind);
  return zoneTierFromMarkerDistance(dist, rStrongPx);
}

function roomFillForTier(tier: HeatMapRoomZoneTier): string {
  switch (tier) {
    case "strong":
      return "rgba(34,197,94,0.5)";
    case "good":
      return "rgba(234,179,8,0.44)";
    case "marginal":
      return "rgba(249,115,22,0.48)";
    default:
      return "rgba(239,68,68,0.5)";
  }
}

export function drawWifiHeatMap(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  bg: HTMLImageElement | null,
  markers: HeatMapMarker[],
  radiusFt: number,
  buildingSpanFt: number,
  layoutRooms: HeatMapLayoutRoom[] | null = null,
): void {
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, cw, ch);

  let rect: BlueprintLayoutRect = { x: 0, y: 0, w: cw, h: ch };
  const useRoomLayout = !bg && layoutRooms && layoutRooms.length > 0;

  if (bg && bg.naturalWidth > 0) {
    rect = blueprintContainRect(cw, ch, bg.naturalWidth, bg.naturalHeight);
    ctx.drawImage(bg, rect.x, rect.y, rect.w, rect.h);
  } else if (useRoomLayout) {
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, cw, ch);
  } else {
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = "rgba(148,163,184,0.35)";
    ctx.lineWidth = 1;
    const g = 6;
    for (let i = 0; i <= g; i++) {
      const t = i / g;
      ctx.beginPath();
      ctx.moveTo(t * cw, 0);
      ctx.lineTo(t * cw, ch);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, t * ch);
      ctx.lineTo(cw, t * ch);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(148,163,184,0.55)";
    ctx.font = "14px system-ui,sans-serif";
    ctx.textAlign = "center";
    if (markers.length === 0) {
      ctx.fillText("No floor plan — grid layout", cw / 2, ch / 2 - 8);
      ctx.font = "12px system-ui,sans-serif";
      ctx.fillText("Run Calculate to show coverage model", cw / 2, ch / 2 + 12);
    } else {
      ctx.fillText("No floor plan image — modeled coverage", cw / 2, ch / 2 - 6);
      ctx.font = "12px system-ui,sans-serif";
      ctx.fillText(
        `${markers.length} AP marker${markers.length === 1 ? "" : "s"} · drag to adjust`,
        cw / 2,
        ch / 2 + 14,
      );
    }
  }

  const span = Math.max(80, Math.sqrt(buildingSpanFt) * 1.25);
  const rStrong = (radiusFt / span) * Math.min(rect.w, rect.h) * 0.95;
  const rMid = rStrong * 0.75;
  const rWeak = rStrong * 0.5;

  if (useRoomLayout && layoutRooms) {
    for (const room of layoutRooms) {
      const x = room.nx * cw;
      const y = room.ny * ch;
      const w = room.nw * cw;
      const hpx = room.nh * ch;
      const tier = roomZoneTierFromMarkers(
        room,
        markers,
        rect,
        rStrong,
        cw,
        ch,
      );
      ctx.fillStyle = roomFillForTier(tier);
      ctx.fillRect(x, y, w, hpx);
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, hpx);
      const label =
        room.name.length > 20 ? `${room.name.slice(0, 18)}…` : room.name;
      ctx.fillStyle = "rgba(248,250,252,0.95)";
      ctx.font = "600 11px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + w / 2, y + hpx / 2 - 8);
      ctx.font = "10px system-ui,sans-serif";
      ctx.fillStyle = "rgba(226,232,240,0.88)";
      ctx.fillText(`${room.sqFt} sq ft`, x + w / 2, y + hpx / 2 + 8);
      const flLabel = room.outdoor ? "Outdoor" : `Fl ${room.floor}`;
      ctx.font = "9px system-ui,sans-serif";
      ctx.fillStyle = "rgba(148,163,184,0.95)";
      ctx.fillText(flLabel, x + w / 2, y + hpx / 2 + 22);
    }
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  if (!useRoomLayout) {
    ctx.fillStyle = "rgba(239,68,68,0.09)";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  for (const m of markers) {
    const { x: cx, y: cy } = markerCanvasXY(m, rect);
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, rStrong);
    grd.addColorStop(0, "rgba(34,197,94,0.35)");
    grd.addColorStop(0.45, "rgba(234,179,8,0.22)");
    grd.addColorStop(0.72, "rgba(249,115,22,0.16)");
    grd.addColorStop(1, "rgba(249,115,22,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, rStrong, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, rMid, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(234,179,8,0.12)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, rWeak, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(34,197,94,0.14)";
    ctx.fill();
  }

  ctx.restore();

  for (const m of markers) {
    const { x: cx, y: cy } = markerCanvasXY(m, rect);
    const fill =
      m.kind === "outdoor"
        ? "rgba(22,163,74,0.95)"
        : "rgba(37,99,235,0.95)";
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const prefix = m.kind === "outdoor" ? "O" : "";
    ctx.fillText(`${prefix}${m.label}`, cx, cy);

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, rStrong, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export function exportHeatMapPng(
  canvas: HTMLCanvasElement,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const octx = out.getContext("2d");
    if (!octx) {
      resolve(null);
      return;
    }
    octx.drawImage(canvas, 0, 0);
    octx.fillStyle = "rgba(15,23,42,0.82)";
    octx.fillRect(0, out.height - 36, out.width, 36);
    octx.fillStyle = "rgba(232,200,74,0.95)";
    octx.font = "600 11px system-ui,sans-serif";
    octx.textAlign = "center";
    octx.textBaseline = "middle";
    octx.fillText(
      "TPP Electrical Contractors Inc. · Est. 1982 · Planning graphic — not to scale",
      out.width / 2,
      out.height - 18,
    );
    out.toBlob((b) => resolve(b), "image/png", 0.95);
  });
}

export function hitTestMarker(
  markers: HeatMapMarker[],
  rect: BlueprintLayoutRect,
  px: number,
  py: number,
  radiusPx = 18,
): HeatMapMarker | null {
  for (let i = markers.length - 1; i >= 0; i--) {
    const m = markers[i];
    const { x, y } = markerCanvasXY(m, rect);
    const dx = px - x;
    const dy = py - y;
    if (dx * dx + dy * dy <= radiusPx * radiusPx) return m;
  }
  return null;
}

export function canvasToNormalized(
  px: number,
  py: number,
  rect: BlueprintLayoutRect,
): { nx: number; ny: number } {
  const nx = (px - rect.x) / Math.max(1, rect.w);
  const ny = (py - rect.y) / Math.max(1, rect.h);
  return {
    nx: Math.min(0.98, Math.max(0.02, nx)),
    ny: Math.min(0.98, Math.max(0.02, ny)),
  };
}

export function snapNormalized(nx: number, ny: number, step = 0.02) {
  return {
    nx: Math.round(nx / step) * step,
    ny: Math.round(ny / step) * step,
  };
}
