export type PlanSource = "local" | "onedrive" | "google-drive" | "apple-files";
export type ScanMode = "mock" | "real";
export type ProjectType = "residential" | "multifamily" | "commercial" | "industrial";
export type JobType = "electrical_estimate" | "low_voltage_estimate" | "lighting_upgrade" | "service_upgrade" | "other";

export interface Project {
  id: string;
  name: string;
  customerName: string;
  location: string;
  projectAddress?: string;
  city?: string;
  state?: string;
  clientName?: string;
  projectType?: ProjectType;
  status: "draft" | "review" | "ready_to_export";
  createdAt: string;
  updatedAt: string;
}


export interface ProjectJob {
  id: string;
  companyId: string;
  projectId: string;
  name: string;
  type: JobType;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRecentActivityItem {
  id: string;
  type: "plan_import" | "estimate" | "load_calculation" | "compliance_report" | "report";
  label: string;
  createdAt: string;
  jobId?: string | null;
}

export interface CreateProjectInput {
  projectName: string;
  projectAddress: string;
  city: string;
  state: string;
  clientName: string;
  projectType: ProjectType;
}

export interface CreateProjectJobInput {
  jobName: string;
  jobType: JobType;
  description: string;
}

export interface Sheet {
  id: string;
  projectId: string;
  jobId?: string | null;
  sheetNumber: string;
  title: string;
  fileName: string;
  pageNumber: number;
  scale: string;
}

export interface Room {
  id: string;
  projectId: string;
  jobId?: string | null;
  sheetId: string;
  name: string;
  areaSqFt: number;
}

export type ElectricalSymbolType =
  | "outlet"
  | "switch"
  | "dimmer"
  | "light"
  | "recessed_light"
  | "fan"
  | "cat6"
  | "speaker"
  | "camera"
  | "smoke_co"
  | "unknown";

export interface SymbolDetection {
  id: string;
  projectId: string;
  jobId?: string | null;
  sheetId: string;
  roomId: string;
  symbolType: ElectricalSymbolType;
  confidence: number;
  legendMatchLabel?: string;
  needsReview: boolean;
}

export interface LegendItem {
  id: string;
  projectId: string;
  symbolKey: string;
  description: string;
}

export interface NoteItem {
  id: string;
  projectId: string;
  jobId?: string | null;
  sheetId: string;
  category: "general" | "electrical";
  text: string;
  impactsScope: boolean;
}

export interface RoomTakeoff {
  roomId: string;
  jobId?: string | null;
  roomName: string;
  counts: Record<ElectricalSymbolType, number>;
}

export interface MaterialEstimate {
  id: string;
  projectId: string;
  jobId?: string | null;
  itemCode: string;
  description: string;
  brand?: string;
  unit: string;
  quantity: number;
}

export interface LightingCircuit {
  id: string;
  roomName: string;
  fixtureCount: number;
  assumedWatts: number;
  estimatedAmps: number;
  dimmerType: "standard_led_150w" | "high_capacity_led_dimmer";
}

export interface ExportJob {
  id: string;
  projectId: string;
  jobId?: string | null;
  type: "csv" | "jobtread_sync";
  status: "queued" | "completed" | "failed";
  createdAt: string;
  details: string;
}

export interface DashboardData {
  jobs?: ProjectJob[];
  recentActivity?: ProjectRecentActivityItem[];
  project: Project;
  sheets: Sheet[];
  rooms: Room[];
  symbols: SymbolDetection[];
  notes: NoteItem[];
  takeoffs: RoomTakeoff[];
  materials: MaterialEstimate[];
  circuits: LightingCircuit[];
  exports: ExportJob[];
}

export interface ImportPlanRequest {
  projectId: string;
  jobId?: string;
  source: PlanSource;
  fileName?: string;
  manualScale?: string;
  scanMode?: ScanMode;
}

export interface SymbolReviewDecision {
  detectionId: string;
  confirmedType: ElectricalSymbolType;
}

export interface ScannerDetectedSheet {
  sheet_number: string;
  title: string;
  page_number: number;
}

export interface ScannerExtractResult {
  sheets: ScannerDetectedSheet[];
  rooms: Array<{ name: string; area_sq_ft: number; page_number?: number; bbox?: [number, number, number, number] }>;
  symbols: Array<{
    room: string;
    type: string;
    confidence: number;
    needs_review?: boolean;
    legend_match?: string;
    legend_similarity?: number;
    ai_candidate_type?: string;
    detection_source?: string;
    legend_symbol_class?: string;
    page_number?: number;
    bbox?: [number, number, number, number];
  }>;
  notes: Array<{ category: string; text: string; impacts_scope: boolean }>;
  legends: Array<{
    symbol_key: string;
    description: string;
    symbol_image?: string;
    symbol_class?: string;
    page_number?: number;
  }>;
  panel_schedule: Array<Record<string, string | number>>;
  fixture_schedule: Array<Record<string, string | number>>;
  detected_scale?: string;
  scale_source?: string;
  scale_needs_input?: boolean;
}

export type ProjectClass = "single_dwelling" | "multifamily" | "commercial";
export type ElectricalSystem = "single_120_240" | "single_120_208" | "three_120_208" | "three_277_480";
export type FinishLevel = "builder_grade" | "mid_range_residential" | "high_end_residential";
export type UtilityProvider = "central_hudson" | "nyseg";

export interface PointBreakdown {
  receptacles: number;
  switches: number;
  lights: number;
  dataPorts: number;
  lowVoltage: number;
}

export interface EstimateInput {
  laborCostPerPoint: number;
  materialCostPerPoint: number;
  markupMultiplier: number;
  points: PointBreakdown;
  baseLaborHoursPerPoint: number;
  squareFeet: number;
  finishLevel: FinishLevel;
}

export interface EstimateResult {
  totalPoints: number;
  pricePerPoint: number;
  laborHours: number;
  laborCost: number;
  materialCost: number;
  totalProjectCost: number;
  pricePerSqFt: number;
  finishLevelMultiplier: number;
}

export interface DedicatedCircuit {
  area: string;
  circuitDescription: string;
  breakerType: string;
  wireSize: string;
}

export interface PanelScheduleRow {
  circuit: string;
  breakerSize: string;
  wireType: string;
  loadDescription: string;
}

export interface LoadCalculatorInput {
  projectClass: ProjectClass;
  electricalSystem: ElectricalSystem;
  squareFeet: number;
  smallApplianceCircuits: number;
  laundryCircuits?: number;
  dryers: number;
  rangeVa?: number;
  waterHeaterVa?: number;
  dishwasherVa?: number;
  disposalVa?: number;
  microwaveVa?: number;
  hvacCoolingVa?: number;
  hvacHeatingVa?: number;
  poolPumpVa?: number;
  poolHeaterVa?: number;
  evChargers?: number;
  evChargerVa?: number;
  otherContinuousLoadsVa?: number;
  otherNonContinuousLoadsVa?: number;
  largestMotorVa: number;
  additionalLoadsVa: number;
}

export interface LoadCalculatorResult {
  lightingLoadVa: number;
  generalLoadVa: number;
  demandAdjustedGeneralLoadVa: number;
  smallApplianceLoadVa: number;
  laundryLoadVa: number;
  dryerLoadVa: number;
  adjustedDryerLoadVa: number;
  rangeLoadVa: number;
  waterHeaterLoadVa: number;
  dishwasherLoadVa: number;
  disposalLoadVa: number;
  microwaveLoadVa: number;
  hvacNonCoincidentLoadVa: number;
  poolPumpLoadVa: number;
  poolHeaterLoadVa: number;
  evLoadVa: number;
  adjustedEvLoadVa: number;
  otherContinuousLoadsVa: number;
  adjustedOtherContinuousLoadsVa: number;
  otherNonContinuousLoadsVa: number;
  largestMotorAdderVa: number;
  totalVa: number;
  serviceVoltage: number;
  phaseType: "single_phase" | "three_phase";
  currentFormula: string;
  calculatedAmps: number;
  recommendedServiceSize: "150A" | "200A" | "320A" | "400A" | "CT metering";
  assumptions: string[];
}

export interface UtilityServiceDesign {
  utilityProvider: UtilityProvider;
  ruleEngine: "central_hudson_bluebook_2026" | "nyseg_local_rules";
  ruleVersion: string;
  ruleReferences: string[];
  serviceSize: "150A" | "200A" | "320A" | "400A" | "CT metering";
  recommendedMeterSocket: string;
  ctCabinetRequired: boolean;
  serviceConductors: string;
  transformerRequirement: string;
  installationType: "overhead" | "underground";
  components: string[];
}

export interface GroundingDesign {
  groundRods: number;
  waterPipeBonding: boolean;
  uferRecommended: boolean;
  notes: string[];
}

export interface MaterialPricePoint {
  supplier: string;
  item: string;
  brand: string;
  unit: string;
  previousPrice: number;
  currentPrice: number;
  changePercent: number;
  checkedAt: string;
}

export interface MaterialListItem {
  item: string;
  quantity: number;
  unit: string;
  brand?: string;
}

export interface ComplianceReport {
  references: string[];
  checks: Array<{ rule: string; status: "pass" | "review"; note: string }>;
}

export interface PlatformDashboard {
  projectName: string;
  projectType: ProjectClass;
  estimates: EstimateResult;
  loadCalculation: LoadCalculatorResult;
  panelSchedulePreview: PanelScheduleRow[];
  materialPrices: MaterialPricePoint[];
  serviceDesign: UtilityServiceDesign;
  complianceSummary: ComplianceReport;
}

export interface BlueprintProcessingRunSummary {
  runId: string;
  companyId: string;
  projectId: string;
  jobId?: string | null;
  sourceFileName: string;
  scanMode: string;
  processedSheets: number;
  detectedRoomsCount: number;
  createdAt: string;
}

export interface ProjectEstimateMetricPoint {
  estimateId: string;
  createdAt: string;
  totalPoints: number;
  totalProjectCost: number;
  pricePerPoint: number;
  pricePerSqFt: number;
  laborHours: number;
}

export interface ProjectEstimateMetricsSummary {
  count: number;
  avgPricePerPoint: number;
  avgPricePerSqFt: number;
  latestTotalCost: number;
  latestTotalPoints: number;
}

export interface ProjectPanelSchedule {
  scheduleId: string;
  createdAt: string;
  sourceCircuits: DedicatedCircuit[];
  rows: PanelScheduleRow[];
}

export interface ProjectServiceDesignRecord {
  designId: string;
  createdAt: string;
  provider: UtilityProvider;
  serviceAmps: number;
  continuousLoadAmps?: number;
  installationType: "overhead" | "underground";
  serviceSize: "150A" | "200A" | "320A" | "400A" | "CT metering";
  design: UtilityServiceDesign;
}

export interface ProjectMaterialListRecord {
  listId: string;
  createdAt: string;
  source: "takeoff" | "fallback";
  items: MaterialEstimate[];
}

export interface ProjectMaterialPriceSnapshot {
  snapshotId: string;
  createdAt: string;
  source: "manual" | "scheduled_30_day";
  prices: MaterialPricePoint[];
}

export type UtilityProviderName = "Central Hudson" | "NYSEG";
export type LoadCalculationMethod = "NEC Standard Method" | "NEC Optional Method";

export interface CompanySettings {
  id: string;
  companyId: string;
  defaultLaborRate: number;
  apprenticeLaborRate: number;
  laborBurdenPercentage: number;
  materialMarkupPercentage: number;
  overheadPercentage: number;
  profitMarginPercentage: number;
  preferredWireBrand: string | null;
  preferredDeviceBrand: string | null;
  preferredBreakerBrand: string | null;
  defaultUtilityProvider: UtilityProviderName;
  defaultVoltageSystem: "120/240" | "120/208" | "277/480";
  electricalCodeVersion: "NEC 2023";
  defaultPricePerPoint: number;
  defaultCostPerSquareFoot: number;
  defaultLaborHoursPerPoint: number;
  defaultCrewSize: number;
  loadCalculationMethod: LoadCalculationMethod;
  createdAt: string;
  updatedAt: string;
}

export interface CompanySettingsUpdateInput {
  defaultLaborRate?: number;
  apprenticeLaborRate?: number;
  laborBurdenPercentage?: number;
  materialMarkupPercentage?: number;
  overheadPercentage?: number;
  profitMarginPercentage?: number;
  preferredWireBrand?: string | null;
  preferredDeviceBrand?: string | null;
  preferredBreakerBrand?: string | null;
  defaultUtilityProvider?: UtilityProviderName;
  defaultVoltageSystem?: "120/240" | "120/208" | "277/480";
  defaultPricePerPoint?: number;
  defaultCostPerSquareFoot?: number;
  defaultLaborHoursPerPoint?: number;
  defaultCrewSize?: number;
  loadCalculationMethod?: LoadCalculationMethod;
}

export interface SupplierAccount {
  id: string;
  companyId: string;
  supplierName: "Home Depot Pro" | "Copper Electric Supply" | "HZ Electric Supply";
  username: string | null;
  encryptedPassword: string | null;
  apiToken: string | null;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierAccountUpsertInput {
  supplierName: "Home Depot Pro" | "Copper Electric Supply" | "HZ Electric Supply";
  username?: string | null;
  encryptedPassword?: string | null;
  apiToken?: string | null;
  lastLogin?: string | null;
}



