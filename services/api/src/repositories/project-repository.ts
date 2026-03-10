import type {
  CreateProjectInput,
  DashboardData,
  ExportJob,
  MaterialEstimate,
  NoteItem,
  Project,
  ProjectJob,
  ProjectRecentActivityItem,
  Room,
  RoomTakeoff,
  Sheet,
  SymbolDetection
} from "@package/shared";
import { randomUUID } from "node:crypto";
import { getDbPool } from "../db/postgres.js";

type PgRow = Record<string, unknown>;

function mapProjectRow(row: PgRow): Project {
  const city = row.city ? String(row.city) : undefined;
  const state = row.state ? String(row.state) : undefined;
  const locationFallback =
    city && state ? `${city}, ${state}` : city ?? state ?? String(row.location ?? "Unknown Location");

  return {
    id: String(row.id),
    name: String(row.name),
    customerName: String(row.customer_name ?? row.client_name ?? "Unknown Customer"),
    location: locationFallback,
    projectAddress: row.project_address ? String(row.project_address) : undefined,
    city,
    state,
    clientName: row.client_name ? String(row.client_name) : undefined,
    projectType: row.project_type ? String(row.project_type).toLowerCase() as Project["projectType"] : undefined,
    status: (row.status as Project["status"]) ?? "draft",
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString())
  };
}

function mapBlueprintRow(row: PgRow): Sheet {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    jobId: row.job_id ? String(row.job_id) : null,
    sheetNumber: String(row.sheet_number ?? ""),
    title: String(row.title ?? ""),
    fileName: String(row.file_name ?? ""),
    pageNumber: Number(row.page_number ?? 0),
    scale: String(row.plan_scale ?? "NTS")
  };
}

function mapRoomRow(row: PgRow): Room {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    jobId: row.job_id ? String(row.job_id) : null,
    sheetId: String(row.blueprint_id ?? row.sheet_id ?? ""),
    name: String(row.name),
    areaSqFt: Number(row.area_sq_ft ?? 0)
  };
}

function mapSymbolRow(row: PgRow): SymbolDetection {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    jobId: row.job_id ? String(row.job_id) : null,
    sheetId: String(row.blueprint_id ?? row.sheet_id ?? ""),
    roomId: row.room_id ? String(row.room_id) : "",
    symbolType: String(row.symbol_type) as SymbolDetection["symbolType"],
    confidence: Number(row.confidence ?? 0),
    legendMatchLabel: row.legend_match_label ? String(row.legend_match_label) : undefined,
    needsReview: Boolean(row.needs_review)
  };
}

function mapNoteRow(row: PgRow): NoteItem {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    jobId: row.job_id ? String(row.job_id) : null,
    sheetId: row.blueprint_id ? String(row.blueprint_id) : row.sheet_id ? String(row.sheet_id) : "",
    category: String(row.category) as NoteItem["category"],
    text: String(row.note_text),
    impactsScope: Boolean(row.impacts_scope)
  };
}

function mapMaterialRow(row: PgRow): MaterialEstimate {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    jobId: row.job_id ? String(row.job_id) : null,
    itemCode: String(row.item_code),
    description: String(row.description),
    unit: String(row.unit),
    quantity: Number(row.quantity)
  };
}

function mapExportRow(row: PgRow): ExportJob {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    jobId: row.job_id ? String(row.job_id) : null,
    type: String(row.export_type) as ExportJob["type"],
    status: String(row.status) as ExportJob["status"],
    createdAt: String(row.created_at),
    details: String(row.details ?? "")
  };
}

function buildRoomTakeoffs(rows: PgRow[], rooms: Room[]): RoomTakeoff[] {
  const roomById = new Map<string, Room>();
  for (const room of rooms) {
    roomById.set(room.id, room);
  }

  const takeoffs: RoomTakeoff[] = [];
  for (const row of rows) {
    const json = row.takeoff_json as Record<string, unknown> | null;
    if (!json) {
      continue;
    }

    const roomId = typeof json.roomId === "string" ? json.roomId : "";
    const room = roomById.get(roomId);
    const counts = (json.counts ?? {}) as RoomTakeoff["counts"];

    takeoffs.push({
      roomId,
      jobId: typeof json.jobId === "string" ? json.jobId : null,
      roomName: typeof json.roomName === "string" ? json.roomName : room?.name ?? "Unassigned",
      counts
    });
  }

  return takeoffs;
}

async function safeQuery(sql: string, values: unknown[] = []): Promise<PgRow[]> {
  const pool = getDbPool();
  try {
    const result = await pool.query(sql, values);
    return result.rows as PgRow[];
  } catch (error) {
    const pgError = error as { code?: string; message?: string };
    // Legacy compatibility queries may hit tables that are intentionally absent
    // in the newer text-ID schema. Treat them as empty result sets.
    if (pgError.code === "42P01" || pgError.code === "42703") {
      return [];
    }
    throw new Error(`Project repository query failed: ${(error as Error).message}`);
  }
}

function synthProject(companyId: string, projectId: string, createdAt?: string): Project {
  const now = createdAt ?? new Date().toISOString();
  return {
    id: projectId,
    name: `Project ${projectId}`,
    customerName: companyId,
    location: "Unknown Location",
    status: "draft",
    createdAt: now,
    updatedAt: now
  };
}

function mapProjectActivity(row: PgRow): ProjectRecentActivityItem {
  return {
    id: String(row.id),
    type: String(row.activity_type) as ProjectRecentActivityItem["type"],
    label: String(row.label),
    createdAt: String(row.created_at),
    jobId: row.job_id ? String(row.job_id) : null
  };
}

export async function createProjectForCompany(companyId: string, input: CreateProjectInput): Promise<Project> {
  const pool = getDbPool();
  const projectId = randomUUID();

  const result = await pool.query<PgRow>(
    `
    INSERT INTO projects (
      id,
      company_id,
      name,
      customer_name,
      location,
      status,
      project_address,
      city,
      state,
      client_name,
      project_type
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING id, name, customer_name, location, status, project_address, city, state, client_name, project_type, created_at, updated_at
    `,
    [
      projectId,
      companyId,
      input.projectName,
      input.clientName,
      `${input.city}, ${input.state}`,
      "draft",
      input.projectAddress,
      input.city,
      input.state,
      input.clientName,
      input.projectType
    ]
  );

  return mapProjectRow(result.rows[0]);
}

export async function listProjectsForCompany(companyId: string): Promise<Project[]> {
  const projects = await safeQuery(
    `
      SELECT id, name, customer_name, location, status, project_address, city, state, client_name, project_type, created_at, updated_at
      FROM projects
      WHERE company_id::text = $1
      ORDER BY created_at DESC
    `,
    [companyId]
  );

  const blueprintProjects = await safeQuery(
    `
      SELECT project_id, MIN(created_at) AS created_at
      FROM project_blueprints
      WHERE company_id = $1
      GROUP BY project_id
      ORDER BY MIN(created_at) DESC
    `,
    [companyId]
  );

  const byId = new Map<string, Project>();
  for (const row of projects) {
    const project = mapProjectRow(row);
    byId.set(project.id, project);
  }

  for (const row of blueprintProjects) {
    const projectId = String(row.project_id);
    if (!byId.has(projectId)) {
      byId.set(projectId, synthProject(companyId, projectId, String(row.created_at)));
    }
  }

  return Array.from(byId.values());
}

export async function updateProjectForCompany(params: {
  companyId: string;
  projectId: string;
  input: {
    projectName: string;
    projectAddress: string;
    city: string;
    state: string;
    clientName: string;
    projectType: NonNullable<Project["projectType"]>;
  };
}): Promise<Project | null> {
  const pool = getDbPool();
  const location = `${params.input.city}, ${params.input.state}`;

  const result = await pool.query<PgRow>(
    `
    UPDATE projects
    SET
      name = $3,
      customer_name = $4,
      location = $5,
      project_address = $6,
      city = $7,
      state = $8,
      client_name = $9,
      project_type = $10,
      updated_at = NOW()
    WHERE company_id::text = $1
      AND id::text = $2
    RETURNING id, name, customer_name, location, status, project_address, city, state, client_name, project_type, created_at, updated_at
    `,
    [
      params.companyId,
      params.projectId,
      params.input.projectName,
      params.input.clientName,
      location,
      params.input.projectAddress,
      params.input.city,
      params.input.state,
      params.input.clientName,
      params.input.projectType
    ]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapProjectRow(result.rows[0]);
}

export async function deleteProjectForCompany(params: { companyId: string; projectId: string }): Promise<boolean> {
  const pool = getDbPool();
  const client = await pool.connect();

  async function deleteScoped(tableName: string): Promise<void> {
    try {
      await client.query(
        `DELETE FROM ${tableName} WHERE company_id = $1 AND project_id = $2`,
        [params.companyId, params.projectId]
      );
    } catch (error) {
      const pgError = error as { code?: string };
      if (pgError.code !== "42P01" && pgError.code !== "42703") {
        throw error;
      }
    }
  }

  try {
    await client.query("BEGIN");

    await deleteScoped("project_symbol_corrections");
    await deleteScoped("project_legend_symbols");
    await deleteScoped("blueprint_processing_sheet_results");
    await deleteScoped("blueprint_processing_runs");
    await deleteScoped("project_material_price_snapshots");
    await deleteScoped("project_material_lists");
    await deleteScoped("project_service_designs");
    await deleteScoped("project_panel_schedules");
    await deleteScoped("project_estimates");
    await deleteScoped("project_export_jobs");
    await deleteScoped("project_symbol_detections");
    await deleteScoped("project_notes");
    await deleteScoped("project_rooms");
    await deleteScoped("project_blueprints");
    await deleteScoped("project_jobs");

    const deletedProject = await client.query(
      `
      DELETE FROM projects
      WHERE company_id::text = $1
        AND id::text = $2
      `,
      [params.companyId, params.projectId]
    );

    await client.query("COMMIT");
    const deletedCount = Number((deletedProject as { rowCount?: number }).rowCount ?? 0);
    return deletedCount > 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function renameProjectIdForCompany(params: {
  companyId: string;
  currentProjectId: string;
  newProjectId: string;
}): Promise<boolean> {
  if (params.currentProjectId === params.newProjectId) {
    return true;
  }

  const pool = getDbPool();
  const client = await pool.connect();

  async function updateProjectScope(tableName: string): Promise<void> {
    try {
      await client.query(
        `UPDATE ${tableName} SET project_id = $3 WHERE company_id = $1 AND project_id = $2`,
        [params.companyId, params.currentProjectId, params.newProjectId]
      );
    } catch (error) {
      const pgError = error as { code?: string };
      if (pgError.code !== "42P01" && pgError.code !== "42703") {
        throw error;
      }
    }
  }

  try {
    await client.query("BEGIN");

    const exists = await client.query(
      `
      SELECT id
      FROM projects
      WHERE company_id::text = $1
        AND id::text = $2
      LIMIT 1
      `,
      [params.companyId, params.currentProjectId]
    );
    if (exists.rows.length === 0) {
      await client.query("ROLLBACK");
      return false;
    }

    const collision = await client.query(
      `
      SELECT id
      FROM projects
      WHERE company_id::text = $1
        AND id::text = $2
      LIMIT 1
      `,
      [params.companyId, params.newProjectId]
    );
    if (collision.rows.length > 0) {
      throw new Error("A project with the new project ID already exists.");
    }

    await updateProjectScope("project_jobs");
    await updateProjectScope("project_blueprints");
    await updateProjectScope("project_rooms");
    await updateProjectScope("project_symbol_detections");
    await updateProjectScope("project_notes");
    await updateProjectScope("project_estimates");
    await updateProjectScope("project_panel_schedules");
    await updateProjectScope("project_service_designs");
    await updateProjectScope("project_material_lists");
    await updateProjectScope("project_material_price_snapshots");
    await updateProjectScope("blueprint_processing_runs");
    await updateProjectScope("blueprint_processing_sheet_results");
    await updateProjectScope("project_export_jobs");
    await updateProjectScope("project_legend_symbols");
    await updateProjectScope("project_symbol_corrections");
    await updateProjectScope("project_load_calculations");
    await updateProjectScope("project_wifi_designs");

    await client.query(
      `
      UPDATE projects
      SET id = $3, updated_at = NOW()
      WHERE company_id::text = $1
        AND id::text = $2
      `,
      [params.companyId, params.currentProjectId, params.newProjectId]
    );

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getDashboardForProject(
  companyId: string,
  projectId: string,
  jobId?: string
): Promise<DashboardData | null> {
  const projectRows = await safeQuery(
    `
      SELECT id, name, customer_name, location, status, project_address, city, state, client_name, project_type, created_at, updated_at
      FROM projects
      WHERE company_id::text = $1
        AND id::text = $2
      LIMIT 1
    `,
    [companyId, projectId]
  );

  const sheetsRows = await safeQuery(
    `
      SELECT id, project_id, job_id, sheet_number, title, file_name, page_number, plan_scale, created_at
      FROM project_blueprints
      WHERE company_id = $1
        AND project_id = $2
        AND ($3::text IS NULL OR job_id = $3)
      ORDER BY page_number ASC, created_at ASC
    `,
    [companyId, projectId, jobId ?? null]
  );

  const roomsRows = await safeQuery(
    `
      SELECT id, project_id, job_id, blueprint_id, name, area_sq_ft
      FROM project_rooms
      WHERE company_id = $1
        AND project_id = $2
        AND ($3::text IS NULL OR job_id = $3)
      ORDER BY name ASC
    `,
    [companyId, projectId, jobId ?? null]
  );

  const symbolsRows = await safeQuery(
    `
      SELECT id, project_id, job_id, blueprint_id, room_id, symbol_type, confidence, legend_match_label, needs_review
      FROM project_symbol_detections
      WHERE company_id = $1
        AND project_id = $2
        AND ($3::text IS NULL OR job_id = $3)
      ORDER BY created_at ASC
    `,
    [companyId, projectId, jobId ?? null]
  );

  const notesRows = await safeQuery(
    `
      SELECT id, project_id, job_id, blueprint_id, category, note_text, impacts_scope
      FROM project_notes
      WHERE company_id = $1
        AND project_id = $2
        AND ($3::text IS NULL OR job_id = $3)
      ORDER BY created_at ASC
    `,
    [companyId, projectId, jobId ?? null]
  );

  const legacyTakeoffsRows = await safeQuery(
    `
      SELECT id, project_id, takeoff_json
      FROM takeoffs
      WHERE company_id::text = $1
        AND project_id::text = $2
      ORDER BY created_at DESC
    `,
    [companyId, projectId]
  );

  const legacyMaterialsRows = await safeQuery(
    `
      SELECT id, project_id, NULL::text AS job_id, item_code, description, unit, quantity
      FROM material_estimates
      WHERE company_id::text = $1
        AND project_id::text = $2
      ORDER BY created_at ASC
    `,
    [companyId, projectId]
  );

  const projectExportsRows = await safeQuery(
    `
      SELECT id, project_id, job_id, export_type, status, created_at, details
      FROM project_export_jobs
      WHERE company_id = $1
        AND project_id = $2
        AND ($3::text IS NULL OR job_id = $3)
      ORDER BY created_at DESC
    `,
    [companyId, projectId, jobId ?? null]
  );

  const legacyExportsRows = await safeQuery(
    `
      SELECT id, project_id, NULL::text AS job_id, export_type, status, created_at, details
      FROM export_jobs
      WHERE company_id::text = $1
        AND project_id::text = $2
      ORDER BY created_at DESC
    `,
    [companyId, projectId]
  );

  if (
    projectRows.length === 0 &&
    sheetsRows.length === 0 &&
    roomsRows.length === 0 &&
    symbolsRows.length === 0 &&
    notesRows.length === 0 &&
    legacyTakeoffsRows.length === 0 &&
    legacyMaterialsRows.length === 0 &&
    projectExportsRows.length === 0 &&
    legacyExportsRows.length === 0
  ) {
    return null;
  }

  const project =
    projectRows.length > 0
      ? mapProjectRow(projectRows[0])
      : synthProject(
          companyId,
          projectId,
          sheetsRows.length > 0 ? String(sheetsRows[0].created_at ?? new Date().toISOString()) : undefined
        );

  const rooms = roomsRows.map((row) => mapRoomRow(row));
  const jobsRows = await safeQuery(
    `
      SELECT id, company_id, project_id, job_name, job_type, description, created_at, updated_at
      FROM project_jobs
      WHERE company_id = $1
        AND project_id = $2
      ORDER BY created_at DESC
    `,
    [companyId, projectId]
  );

  const recentRows = await safeQuery(
    `
      SELECT id, job_id, 'plan_import'::text AS activity_type, CONCAT('Imported ', COALESCE(file_name, 'plan file')) AS label, created_at
      FROM project_blueprints
      WHERE company_id = $1 AND project_id = $2
      UNION ALL
      SELECT id, job_id, 'estimate'::text AS activity_type, 'Generated estimate' AS label, created_at
      FROM project_estimates
      WHERE company_id = $1 AND project_id = $2
      ORDER BY created_at DESC
      LIMIT 20
    `,
    [companyId, projectId]
  );

  return {
    project,
    jobs: jobsRows.map((row) => ({
      id: String(row.id),
      companyId: String(row.company_id),
      projectId: String(row.project_id),
      name: String(row.job_name),
      type: String(row.job_type) as ProjectJob["type"],
      description: String(row.description ?? ""),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    })),
    recentActivity: recentRows.map((row) => mapProjectActivity(row)),
    sheets: sheetsRows.map((row) => mapBlueprintRow(row)),
    rooms,
    symbols: symbolsRows.map((row) => mapSymbolRow(row)),
    notes: notesRows.map((row) => mapNoteRow(row)),
    takeoffs: buildRoomTakeoffs(legacyTakeoffsRows, rooms),
    materials: legacyMaterialsRows.map((row) => mapMaterialRow(row)),
    circuits: [],
    exports: [...projectExportsRows, ...legacyExportsRows].map((row) => mapExportRow(row))
  };
}
