import { randomUUID } from "node:crypto";

import { getDbPool } from "../db/postgres.js";

export type TallyDeviceType =
  | "Duplex Receptacle"
  | "GFCI Receptacle"
  | "Switch"
  | "3-way Switch"
  | "4-way Switch"
  | "Lighting Fixture"
  | "Exit Sign"
  | "Emergency Light"
  | "Panel"
  | "Data Port"
  | "Speaker";

export type TallyItem = {
  device: TallyDeviceType;
  aiQuantity: number;
  manualDelta: number;
  quantity: number;
};

const DEVICE_TYPES: TallyDeviceType[] = [
  "Duplex Receptacle",
  "GFCI Receptacle",
  "Switch",
  "3-way Switch",
  "4-way Switch",
  "Lighting Fixture",
  "Exit Sign",
  "Emergency Light",
  "Panel",
  "Data Port",
  "Speaker"
];

function symbolTypeToDevice(symbolType: string, legendLabel?: string | null): TallyDeviceType | null {
  const normalized = symbolType.trim().toLowerCase();
  const label = (legendLabel ?? "").trim().toLowerCase();

  if (normalized === "outlet") {
    if (label.includes("gfci")) {
      return "GFCI Receptacle";
    }
    return "Duplex Receptacle";
  }
  if (normalized === "switch") {
    if (label.includes("3-way")) {
      return "3-way Switch";
    }
    if (label.includes("4-way")) {
      return "4-way Switch";
    }
    return "Switch";
  }
  if (normalized === "light" || normalized === "recessed_light" || normalized === "fan") {
    return "Lighting Fixture";
  }
  if (normalized === "cat6") {
    return "Data Port";
  }
  if (normalized === "speaker") {
    return "Speaker";
  }
  if (normalized === "unknown" && label.includes("exit")) {
    return "Exit Sign";
  }
  if (normalized === "unknown" && label.includes("emergency")) {
    return "Emergency Light";
  }
  if (normalized === "unknown" && (label.includes("panel") || label.includes("subpanel"))) {
    return "Panel";
  }
  return null;
}

async function getAutoCounts(params: { companyId: string; projectId: string; jobId?: string }): Promise<Map<TallyDeviceType, number>> {
  const pool = getDbPool();
  const result = await pool.query<{ symbol_type: string; legend_match_label: string | null; count: string }>(
    `
    SELECT symbol_type, legend_match_label, COUNT(*)::text AS count
    FROM project_symbol_detections
    WHERE company_id = $1
      AND project_id = $2
      AND ($3::text IS NULL OR job_id = $3)
    GROUP BY symbol_type, legend_match_label
    `,
    [params.companyId, params.projectId, params.jobId ?? null]
  );

  const counts = new Map<TallyDeviceType, number>();
  for (const deviceType of DEVICE_TYPES) {
    counts.set(deviceType, 0);
  }

  for (const row of result.rows) {
    const mapped = symbolTypeToDevice(row.symbol_type, row.legend_match_label);
    if (!mapped) {
      continue;
    }
    counts.set(mapped, (counts.get(mapped) ?? 0) + Number(row.count ?? 0));
  }

  return counts;
}

type TallyDbRow = {
  id: string;
  device_type: TallyDeviceType;
  ai_quantity: number;
  manual_delta: number;
  final_quantity: number;
  updated_at: string;
};

async function getStoredTallyRows(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
}): Promise<Map<TallyDeviceType, TallyDbRow>> {
  const pool = getDbPool();
  const result = await pool.query<TallyDbRow>(
    `
    SELECT id, device_type, ai_quantity, manual_delta, final_quantity, updated_at
    FROM project_tally_entries
    WHERE company_id = $1
      AND project_id = $2
      AND ($3::text IS NULL OR job_id = $3)
    `,
    [params.companyId, params.projectId, params.jobId ?? null]
  );

  const map = new Map<TallyDeviceType, TallyDbRow>();
  for (const row of result.rows) {
    map.set(row.device_type, row);
  }
  return map;
}

async function upsertTallyEntry(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
  deviceType: TallyDeviceType;
  aiQuantity: number;
  manualDelta: number;
}): Promise<void> {
  const pool = getDbPool();
  const id = randomUUID();
  await pool.query(
    `
    INSERT INTO project_tally_entries (
      id,
      company_id,
      project_id,
      job_id,
      device_type,
      ai_quantity,
      manual_delta,
      final_quantity
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (company_id, project_id, job_id, device_type)
    DO UPDATE SET
      ai_quantity = EXCLUDED.ai_quantity,
      manual_delta = EXCLUDED.manual_delta,
      final_quantity = EXCLUDED.final_quantity,
      updated_at = NOW()
    `,
    [
      id,
      params.companyId,
      params.projectId,
      params.jobId ?? null,
      params.deviceType,
      params.aiQuantity,
      params.manualDelta,
      params.aiQuantity + params.manualDelta
    ]
  );
}

export async function getTallyList(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
}): Promise<{ tally_list: TallyItem[] }> {
  const autoCounts = await getAutoCounts(params);
  const stored = await getStoredTallyRows(params);

  for (const deviceType of DEVICE_TYPES) {
    const aiQuantity = autoCounts.get(deviceType) ?? 0;
    const existing = stored.get(deviceType);
    const manualDelta = existing?.manual_delta ?? 0;
    await upsertTallyEntry({
      ...params,
      deviceType,
      aiQuantity,
      manualDelta
    });
  }

  const refreshed = await getStoredTallyRows(params);
  return {
    tally_list: DEVICE_TYPES.map((deviceType) => {
      const row = refreshed.get(deviceType);
      const aiQuantity = row?.ai_quantity ?? autoCounts.get(deviceType) ?? 0;
      const manualDelta = row?.manual_delta ?? 0;
      return {
        device: deviceType,
        aiQuantity,
        manualDelta,
        quantity: row?.final_quantity ?? aiQuantity + manualDelta
      };
    })
  };
}

export async function setTallyQuantity(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
  deviceType: TallyDeviceType;
  quantity: number;
}): Promise<void> {
  const autoCounts = await getAutoCounts(params);
  const aiQuantity = autoCounts.get(params.deviceType) ?? 0;
  const manualDelta = params.quantity - aiQuantity;
  await upsertTallyEntry({
    ...params,
    aiQuantity,
    manualDelta
  });
}

export async function addTallyDelta(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
  deviceType: TallyDeviceType;
  delta: number;
}): Promise<void> {
  const autoCounts = await getAutoCounts(params);
  const stored = await getStoredTallyRows(params);
  const currentManualDelta = stored.get(params.deviceType)?.manual_delta ?? 0;
  await upsertTallyEntry({
    ...params,
    aiQuantity: autoCounts.get(params.deviceType) ?? 0,
    manualDelta: currentManualDelta + params.delta
  });
}

export function isSupportedTallyDeviceType(value: string): value is TallyDeviceType {
  return DEVICE_TYPES.includes(value as TallyDeviceType);
}

