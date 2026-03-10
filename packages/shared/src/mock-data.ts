import type {
  DashboardData,
  ElectricalSymbolType,
  ExportJob,
  ImportPlanRequest,
  LegendItem,
  NoteItem,
  Project,
  Room,
  ScannerDetectedSheet,
  ScannerExtractResult,
  Sheet,
  SymbolDetection,
  SymbolReviewDecision
} from "@package/types";
import { buildLightingCircuits, buildMaterialEstimate, buildRoomTakeoffs } from "./estimating.js";

interface MockState {
  projects: Project[];
  sheets: Sheet[];
  rooms: Room[];
  symbols: SymbolDetection[];
  legends: LegendItem[];
  notes: NoteItem[];
  exports: ExportJob[];
}

const now = new Date().toISOString();

const state: MockState = {
  projects: [
    {
      id: "p-001",
      name: "Hudson Ridge Residence",
      customerName: "Hudson Ridge Homes",
      location: "Poughkeepsie, NY",
      status: "review",
      createdAt: now,
      updatedAt: now
    }
  ],
  sheets: [
    {
      id: "s-001",
      projectId: "p-001",
      sheetNumber: "E1.1",
      title: "Electrical Power Plan - First Floor",
      fileName: "hudson-ridge-electrical.pdf",
      pageNumber: 4,
      scale: "1/4\" = 1'-0\""
    },
    {
      id: "s-002",
      projectId: "p-001",
      sheetNumber: "E2.1",
      title: "Lighting Plan - First Floor",
      fileName: "hudson-ridge-electrical.pdf",
      pageNumber: 5,
      scale: "1/4\" = 1'-0\""
    }
  ],
  rooms: [
    { id: "r-001", projectId: "p-001", sheetId: "s-001", name: "Bedroom 1", areaSqFt: 196 },
    { id: "r-002", projectId: "p-001", sheetId: "s-001", name: "Bedroom 2", areaSqFt: 188 },
    { id: "r-003", projectId: "p-001", sheetId: "s-001", name: "Hallway", areaSqFt: 86 },
    { id: "r-004", projectId: "p-001", sheetId: "s-001", name: "Guest Bathroom", areaSqFt: 65 },
    { id: "r-005", projectId: "p-001", sheetId: "s-001", name: "Kitchen", areaSqFt: 252 },
    { id: "r-006", projectId: "p-001", sheetId: "s-001", name: "Living Room", areaSqFt: 320 },
    { id: "r-007", projectId: "p-001", sheetId: "s-001", name: "Garage", areaSqFt: 420 },
    { id: "r-008", projectId: "p-001", sheetId: "s-001", name: "Basement", areaSqFt: 600 }
  ],
  symbols: [
    { id: "sym-001", projectId: "p-001", sheetId: "s-001", roomId: "r-001", symbolType: "outlet", confidence: 0.99, needsReview: false },
    { id: "sym-002", projectId: "p-001", sheetId: "s-001", roomId: "r-001", symbolType: "switch", confidence: 0.95, needsReview: false },
    { id: "sym-003", projectId: "p-001", sheetId: "s-002", roomId: "r-001", symbolType: "recessed_light", confidence: 0.97, needsReview: false },
    { id: "sym-004", projectId: "p-001", sheetId: "s-001", roomId: "r-002", symbolType: "outlet", confidence: 0.98, needsReview: false },
    { id: "sym-005", projectId: "p-001", sheetId: "s-002", roomId: "r-005", symbolType: "light", confidence: 0.83, legendMatchLabel: "L-A", needsReview: true },
    { id: "sym-006", projectId: "p-001", sheetId: "s-002", roomId: "r-006", symbolType: "dimmer", confidence: 0.92, needsReview: false },
    { id: "sym-007", projectId: "p-001", sheetId: "s-001", roomId: "r-007", symbolType: "camera", confidence: 0.88, needsReview: true },
    { id: "sym-008", projectId: "p-001", sheetId: "s-001", roomId: "r-008", symbolType: "smoke_co", confidence: 0.96, needsReview: false },
    { id: "sym-009", projectId: "p-001", sheetId: "s-001", roomId: "r-005", symbolType: "cat6", confidence: 0.94, needsReview: false },
    { id: "sym-010", projectId: "p-001", sheetId: "s-002", roomId: "r-006", symbolType: "fan", confidence: 0.91, needsReview: false }
  ],
  legends: [
    { id: "leg-001", projectId: "p-001", symbolKey: "L-A", description: "Ceiling light fixture" },
    { id: "leg-002", projectId: "p-001", symbolKey: "REC", description: "Recessed LED downlight" },
    { id: "leg-003", projectId: "p-001", symbolKey: "WP-CAM", description: "Exterior camera point" }
  ],
  notes: [
    {
      id: "note-001",
      projectId: "p-001",
      sheetId: "s-001",
      category: "electrical",
      text: "All branch circuits shall use AFCI breakers in habitable spaces.",
      impactsScope: true
    },
    {
      id: "note-002",
      projectId: "p-001",
      sheetId: "s-002",
      category: "general",
      text: "Coordinate fixture mounting heights with reflected ceiling plan.",
      impactsScope: false
    },
    {
      id: "note-003",
      projectId: "p-001",
      sheetId: "s-001",
      category: "electrical",
      text: "Install dedicated 20A circuit for garage receptacles.",
      impactsScope: true
    }
  ],
  exports: []
};

const SYMBOL_TYPES: ElectricalSymbolType[] = [
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

function nextId(prefix: "s" | "r" | "sym" | "leg" | "note"): string {
  const collection =
    prefix === "s"
      ? state.sheets
      : prefix === "r"
        ? state.rooms
        : prefix === "sym"
          ? state.symbols
          : prefix === "leg"
            ? state.legends
            : state.notes;

  return `${prefix}-${String(collection.length + 1).padStart(3, "0")}`;
}

function normalizeSymbolType(value: string): ElectricalSymbolType {
  const lowered = value.toLowerCase().trim();
  if (SYMBOL_TYPES.includes(lowered as ElectricalSymbolType)) {
    return lowered as ElectricalSymbolType;
  }

  if (lowered.includes("recess")) {
    return "recessed_light";
  }

  if (lowered.includes("co") || lowered.includes("smoke")) {
    return "smoke_co";
  }

  if (lowered.includes("cam")) {
    return "camera";
  }

  return "light";
}

function touchProject(projectId: string): void {
  const project = state.projects.find((item) => item.id === projectId);
  if (project) {
    project.updatedAt = new Date().toISOString();
  }
}

export function listProjects(): Project[] {
  return state.projects;
}

export function getDashboardData(projectId: string): DashboardData {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const sheets = state.sheets.filter((item) => item.projectId === projectId);
  const rooms = state.rooms.filter((item) => item.projectId === projectId);
  const symbols = state.symbols.filter((item) => item.projectId === projectId);
  const notes = state.notes.filter((item) => item.projectId === projectId);
  const takeoffs = buildRoomTakeoffs(rooms, symbols);
  const materials = buildMaterialEstimate(takeoffs).map((item) => ({ ...item, projectId }));
  const circuits = buildLightingCircuits(takeoffs);
  const exports = state.exports.filter((item) => item.projectId === projectId);

  return { project, sheets, rooms, symbols, notes, takeoffs, materials, circuits, exports };
}

export function submitImport(request: ImportPlanRequest): DashboardData {
  const project = state.projects.find((item) => item.id === request.projectId);
  if (!project) {
    throw new Error(`Project not found: ${request.projectId}`);
  }

  const nextSheetNumber = state.sheets.length + 1;
  const newSheet: Sheet = {
    id: nextId("s"),
    projectId: request.projectId,
    sheetNumber: `E${nextSheetNumber}.1`,
    title: `Imported Sheet from ${request.source}`,
    fileName: request.fileName ?? `${request.source}-import.pdf`,
    pageNumber: nextSheetNumber,
    scale: request.manualScale ?? "1/4\" = 1'-0\""
  };

  state.sheets.push(newSheet);
  touchProject(request.projectId);

  return getDashboardData(request.projectId);
}

export function ingestScannerSplit(projectId: string, fileName: string, detectedSheets: ScannerDetectedSheet[]): Sheet[] {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const created: Sheet[] = [];
  for (const sheet of detectedSheets) {
    let existing = state.sheets.find(
      (item) => item.projectId === projectId && item.sheetNumber.toLowerCase() === sheet.sheet_number.toLowerCase()
    );

    if (!existing) {
      existing = {
        id: nextId("s"),
        projectId,
        sheetNumber: sheet.sheet_number,
        title: sheet.title || "Imported Sheet",
        fileName,
        pageNumber: sheet.page_number,
        scale: "1/4\" = 1'-0\""
      };
      state.sheets.push(existing);
    } else {
      existing.title = sheet.title || existing.title;
      existing.pageNumber = sheet.page_number;
      existing.fileName = fileName;
    }

    created.push(existing);
  }

  touchProject(projectId);
  return created;
}

export function ingestScannerExtraction(projectId: string, sheetId: string, extraction: ScannerExtractResult): DashboardData {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  state.rooms = state.rooms.filter((item) => !(item.projectId === projectId && item.sheetId === sheetId));
  state.symbols = state.symbols.filter((item) => !(item.projectId === projectId && item.sheetId === sheetId));
  state.notes = state.notes.filter((item) => !(item.projectId === projectId && item.sheetId === sheetId));

  const roomIdByName = new Map<string, string>();
  for (const room of extraction.rooms) {
    const roomId = nextId("r");
    const roomEntry: Room = {
      id: roomId,
      projectId,
      sheetId,
      name: room.name,
      areaSqFt: Number(room.area_sq_ft ?? 0)
    };
    state.rooms.push(roomEntry);
    roomIdByName.set(room.name.toLowerCase(), roomId);
  }

  for (const legend of extraction.legends) {
    const existing = state.legends.find(
      (item) => item.projectId === projectId && item.symbolKey.toLowerCase() === legend.symbol_key.toLowerCase()
    );

    if (existing) {
      existing.description = legend.description;
    } else {
      state.legends.push({
        id: nextId("leg"),
        projectId,
        symbolKey: legend.symbol_key,
        description: legend.description
      });
    }
  }

  for (const note of extraction.notes) {
    const category = note.category.toLowerCase().includes("elect") ? "electrical" : "general";
    state.notes.push({
      id: nextId("note"),
      projectId,
      sheetId,
      category,
      text: note.text,
      impactsScope: Boolean(note.impacts_scope)
    });
  }

  const fallbackRoomId = state.rooms.find((item) => item.projectId === projectId && item.sheetId === sheetId)?.id;
  if (fallbackRoomId) {
    for (const symbol of extraction.symbols) {
      const roomId = roomIdByName.get(symbol.room.toLowerCase()) ?? fallbackRoomId;
      if (!roomId) {
        continue;
      }

      state.symbols.push({
        id: nextId("sym"),
        projectId,
        sheetId,
        roomId,
        symbolType: normalizeSymbolType(symbol.type),
        confidence: Number(symbol.confidence ?? 0),
        legendMatchLabel: symbol.legend_match,
        needsReview: Boolean(symbol.needs_review)
      });
    }
  }

  touchProject(projectId);
  return getDashboardData(projectId);
}

export function getReviewQueue(projectId: string): SymbolDetection[] {
  return state.symbols.filter((item) => item.projectId === projectId && item.needsReview);
}

export function confirmSymbol(projectId: string, decision: SymbolReviewDecision): SymbolDetection {
  const symbol = state.symbols.find((item) => item.projectId === projectId && item.id === decision.detectionId);
  if (!symbol) {
    throw new Error(`Symbol not found: ${decision.detectionId}`);
  }

  symbol.symbolType = decision.confirmedType;
  symbol.needsReview = false;
  symbol.legendMatchLabel = symbol.legendMatchLabel ?? "USER-CONFIRMED";

  return symbol;
}

export function queueCsvExport(projectId: string): ExportJob {
  const job: ExportJob = {
    id: `exp-${Date.now()}`,
    projectId,
    type: "csv",
    status: "completed",
    createdAt: new Date().toISOString(),
    details: "JobTread-compatible CSV generated"
  };

  state.exports.push(job);
  return job;
}

export function queueJobTreadSync(projectId: string): ExportJob {
  const job: ExportJob = {
    id: `sync-${Date.now()}`,
    projectId,
    type: "jobtread_sync",
    status: "queued",
    createdAt: new Date().toISOString(),
    details: "JobTread sync queued for budget import"
  };

  state.exports.push(job);
  return job;
}
