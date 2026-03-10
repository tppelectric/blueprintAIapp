import { randomUUID } from "node:crypto";

import { getDbPool } from "../db/postgres.js";

export type FixtureLibraryItem = {
  id: string;
  deviceType: string;
  planSymbol: string | null;
  deviceName: string;
  manufacturer: string;
  modelNumber: string;
  description: string | null;
  commonApplication: string | null;
  mountingType: string | null;
  lumens: number | null;
  wattage: number | null;
  voltage: string | null;
  unitCost: number | null;
  installedCost: number | null;
  imageUrl: string | null;
  installationPhoto: string | null;
  manufacturerPhoto: string | null;
  necReference: string | null;
};

export type FixtureSearchFilters = {
  q?: string;
  fixtureType?: string;
  manufacturer?: string;
  lumensMin?: number;
  lumensMax?: number;
  wattageMin?: number;
  wattageMax?: number;
  voltage?: string;
  mountingType?: string;
  priceMin?: number;
  priceMax?: number;
  limit?: number;
};

const SEED_FIXTURES: Array<Omit<FixtureLibraryItem, "id">> = [
  {
    deviceType: "LED Panel",
    planSymbol: "□",
    deviceName: "2x4 LED Panel",
    manufacturer: "Lithonia",
    modelNumber: "CPX 2X4 ALO8 SWW7 M4",
    description: "2x4 lay-in LED panel suitable for office/commercial ceilings.",
    commonApplication: "Drop-ceiling open office area",
    mountingType: "drop ceiling",
    lumens: 4000,
    wattage: 32,
    voltage: "120-277",
    unitCost: 130,
    installedCost: 195,
    imageUrl: "/images/devices/lithonia_cpx_panel.jpg",
    installationPhoto: "/images/devices/lithonia_cpx_install.jpg",
    manufacturerPhoto: "/images/manufacturers/lithonia_logo.jpg",
    necReference: null
  },
  {
    deviceType: "Duplex Receptacle",
    planSymbol: "⊔",
    deviceName: "Duplex Receptacle",
    manufacturer: "Leviton",
    modelNumber: "T5320-W",
    description: "Standard 15A tamper-resistant duplex receptacle.",
    commonApplication: "General-purpose branch circuit outlets",
    mountingType: "flush wall box",
    lumens: null,
    wattage: null,
    voltage: "125",
    unitCost: 3.95,
    installedCost: 16.25,
    imageUrl: "/images/devices/leviton_t5320.jpg",
    installationPhoto: "/images/devices/duplex_install.jpg",
    manufacturerPhoto: "/images/manufacturers/leviton_logo.jpg",
    necReference: "NEC 210.52"
  },
  {
    deviceType: "Switch",
    planSymbol: "S",
    deviceName: "Single Pole Switch",
    manufacturer: "Legrand",
    modelNumber: "TM870WCC6",
    description: "Spec-grade single-pole toggle switch.",
    commonApplication: "Lighting control in residential and light commercial spaces",
    mountingType: "flush wall box",
    lumens: null,
    wattage: null,
    voltage: "120-277",
    unitCost: 5.5,
    installedCost: 18.75,
    imageUrl: "/images/devices/legrand_switch.jpg",
    installationPhoto: "/images/devices/switch_install.jpg",
    manufacturerPhoto: "/images/manufacturers/legrand_logo.jpg",
    necReference: null
  },
  {
    deviceType: "Data Port",
    planSymbol: "D",
    deviceName: "Cat6 Data Port",
    manufacturer: "Hubbell",
    modelNumber: "HXJ6W",
    description: "Category 6 keystone jack for structured cabling systems.",
    commonApplication: "Data outlets for network drops",
    mountingType: "flush wall plate",
    lumens: null,
    wattage: null,
    voltage: null,
    unitCost: 8.8,
    installedCost: 29.6,
    imageUrl: "/images/devices/hubbell_cat6.jpg",
    installationPhoto: "/images/devices/data_port_install.jpg",
    manufacturerPhoto: "/images/manufacturers/hubbell_logo.jpg",
    necReference: null
  },
  {
    deviceType: "Lighting Fixture",
    planSymbol: "○",
    deviceName: "LED High Bay",
    manufacturer: "Cooper Lighting",
    modelNumber: "Metalux HBG-18L-U",
    description: "UFO style LED high-bay fixture for larger ceiling heights.",
    commonApplication: "Warehouse and industrial lighting",
    mountingType: "pendant/hook",
    lumens: 18000,
    wattage: 120,
    voltage: "120-277",
    unitCost: 210,
    installedCost: 315,
    imageUrl: "/images/devices/cooper_highbay.jpg",
    installationPhoto: "/images/devices/highbay_install.jpg",
    manufacturerPhoto: "/images/manufacturers/cooper_logo.jpg",
    necReference: null
  },
  {
    deviceType: "Lighting Fixture",
    planSymbol: "○",
    deviceName: "LED Wall Pack",
    manufacturer: "RAB Lighting",
    modelNumber: "WPLED26",
    description: "Exterior LED wall pack for perimeter lighting.",
    commonApplication: "Exterior building perimeter lighting",
    mountingType: "surface wall",
    lumens: 3400,
    wattage: 26,
    voltage: "120-277",
    unitCost: 118,
    installedCost: 184,
    imageUrl: "/images/devices/rab_wallpack.jpg",
    installationPhoto: "/images/devices/wallpack_install.jpg",
    manufacturerPhoto: "/images/manufacturers/rab_logo.jpg",
    necReference: null
  },
  {
    deviceType: "Lighting Fixture",
    planSymbol: "○",
    deviceName: "LED Troffer",
    manufacturer: "Cree",
    modelNumber: "ZR22-40L-40K-10V",
    description: "2x2 LED troffer fixture for office and corridor lighting.",
    commonApplication: "Commercial interior lighting",
    mountingType: "drop ceiling",
    lumens: 3900,
    wattage: 32,
    voltage: "120-277",
    unitCost: 165,
    installedCost: 245,
    imageUrl: "/images/devices/cree_troffer.jpg",
    installationPhoto: "/images/devices/troffer_install.jpg",
    manufacturerPhoto: "/images/manufacturers/cree_logo.jpg",
    necReference: null
  },
  {
    deviceType: "Panel",
    planSymbol: "P",
    deviceName: "Load Center Panelboard",
    manufacturer: "Eaton",
    modelNumber: "BRP40L200",
    description: "Main breaker load center panelboard, 200A.",
    commonApplication: "Service and distribution panel for dwelling/commercial spaces",
    mountingType: "surface or flush",
    lumens: null,
    wattage: null,
    voltage: "120/240",
    unitCost: 286,
    installedCost: 520,
    imageUrl: "/images/devices/eaton_panel.jpg",
    installationPhoto: "/images/devices/panel_install.jpg",
    manufacturerPhoto: "/images/manufacturers/eaton_logo.jpg",
    necReference: "NEC 408"
  },
  {
    deviceType: "Control Device",
    planSymbol: "D",
    deviceName: "LED Dimmer",
    manufacturer: "Lutron",
    modelNumber: "DVCL-153P",
    description: "LED-compatible dimmer for common retrofit applications.",
    commonApplication: "Residential lighting dimming control",
    mountingType: "flush wall box",
    lumens: null,
    wattage: 150,
    voltage: "120",
    unitCost: 24,
    installedCost: 46,
    imageUrl: "/images/devices/lutron_dimmer.jpg",
    installationPhoto: "/images/devices/dimmer_install.jpg",
    manufacturerPhoto: "/images/manufacturers/lutron_logo.jpg",
    necReference: null
  }
];

function mapRow(row: Record<string, unknown>): FixtureLibraryItem {
  return {
    id: String(row.id),
    deviceType: String(row.device_type),
    planSymbol: row.plan_symbol ? String(row.plan_symbol) : null,
    deviceName: String(row.device_name),
    manufacturer: String(row.manufacturer),
    modelNumber: String(row.model_number),
    description: row.description ? String(row.description) : null,
    commonApplication: row.common_application ? String(row.common_application) : null,
    mountingType: row.mounting_type ? String(row.mounting_type) : null,
    lumens: row.lumens === null || row.lumens === undefined ? null : Number(row.lumens),
    wattage: row.wattage === null || row.wattage === undefined ? null : Number(row.wattage),
    voltage: row.voltage ? String(row.voltage) : null,
    unitCost: row.unit_cost === null || row.unit_cost === undefined ? null : Number(row.unit_cost),
    installedCost: row.installed_cost === null || row.installed_cost === undefined ? null : Number(row.installed_cost),
    imageUrl: row.image_url ? String(row.image_url) : null,
    installationPhoto: row.installation_photo ? String(row.installation_photo) : null,
    manufacturerPhoto: row.manufacturer_photo ? String(row.manufacturer_photo) : null,
    necReference: row.nec_reference ? String(row.nec_reference) : null
  };
}

async function ensureFixtureLibrarySeeded(companyId: string): Promise<void> {
  const pool = getDbPool();
  const countResult = await pool.query<{ count: string }>(
    `
    SELECT COUNT(*)::text AS count
    FROM device_fixture_library
    WHERE company_id = $1
    `,
    [companyId]
  );
  if (Number(countResult.rows[0]?.count ?? "0") > 0) {
    return;
  }

  for (const item of SEED_FIXTURES) {
    await pool.query(
      `
      INSERT INTO device_fixture_library (
        id,
        company_id,
        device_type,
        plan_symbol,
        device_name,
        manufacturer,
        model_number,
        description,
        common_application,
        mounting_type,
        lumens,
        wattage,
        voltage,
        unit_cost,
        installed_cost,
        image_url,
        installation_photo,
        manufacturer_photo,
        nec_reference
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
      )
      `,
      [
        randomUUID(),
        companyId,
        item.deviceType,
        item.planSymbol,
        item.deviceName,
        item.manufacturer,
        item.modelNumber,
        item.description,
        item.commonApplication,
        item.mountingType,
        item.lumens,
        item.wattage,
        item.voltage,
        item.unitCost,
        item.installedCost,
        item.imageUrl,
        item.installationPhoto,
        item.manufacturerPhoto,
        item.necReference
      ]
    );
  }
}

export async function searchByManufacturer(companyId: string, manufacturer: string): Promise<FixtureLibraryItem[]> {
  return searchFixtures(companyId, { manufacturer });
}

export async function searchByFixtureType(companyId: string, fixtureType: string): Promise<FixtureLibraryItem[]> {
  return searchFixtures(companyId, { fixtureType });
}

export async function searchByLumens(
  companyId: string,
  range: { min?: number; max?: number }
): Promise<FixtureLibraryItem[]> {
  return searchFixtures(companyId, { lumensMin: range.min, lumensMax: range.max });
}

export async function searchByWattage(
  companyId: string,
  range: { min?: number; max?: number }
): Promise<FixtureLibraryItem[]> {
  return searchFixtures(companyId, { wattageMin: range.min, wattageMax: range.max });
}

export async function searchFixtures(companyId: string, filters: FixtureSearchFilters): Promise<FixtureLibraryItem[]> {
  await ensureFixtureLibrarySeeded(companyId);
  const pool = getDbPool();

  const values: Array<string | number> = [companyId];
  const where: string[] = ["company_id = $1"];

  if (filters.q && filters.q.trim().length > 0) {
    values.push(`%${filters.q.trim()}%`);
    const idx = values.length;
    where.push(
      `(device_name ILIKE $${idx} OR model_number ILIKE $${idx} OR manufacturer ILIKE $${idx} OR description ILIKE $${idx})`
    );
  }
  if (filters.fixtureType && filters.fixtureType.trim().length > 0) {
    values.push(`%${filters.fixtureType.trim()}%`);
    where.push(`device_type ILIKE $${values.length}`);
  }
  if (filters.manufacturer && filters.manufacturer.trim().length > 0) {
    values.push(filters.manufacturer.trim());
    where.push(`manufacturer ILIKE $${values.length}`);
  }
  if (filters.lumensMin !== undefined) {
    values.push(filters.lumensMin);
    where.push(`lumens >= $${values.length}`);
  }
  if (filters.lumensMax !== undefined) {
    values.push(filters.lumensMax);
    where.push(`lumens <= $${values.length}`);
  }
  if (filters.wattageMin !== undefined) {
    values.push(filters.wattageMin);
    where.push(`wattage >= $${values.length}`);
  }
  if (filters.wattageMax !== undefined) {
    values.push(filters.wattageMax);
    where.push(`wattage <= $${values.length}`);
  }
  if (filters.voltage && filters.voltage.trim().length > 0) {
    values.push(`%${filters.voltage.trim()}%`);
    where.push(`voltage ILIKE $${values.length}`);
  }
  if (filters.mountingType && filters.mountingType.trim().length > 0) {
    values.push(`%${filters.mountingType.trim()}%`);
    where.push(`mounting_type ILIKE $${values.length}`);
  }
  if (filters.priceMin !== undefined) {
    values.push(filters.priceMin);
    where.push(`COALESCE(unit_cost, 0) >= $${values.length}`);
  }
  if (filters.priceMax !== undefined) {
    values.push(filters.priceMax);
    where.push(`COALESCE(unit_cost, 0) <= $${values.length}`);
  }

  values.push(Math.min(Math.max(filters.limit ?? 50, 1), 250));
  const limitIndex = values.length;

  const result = await pool.query<Record<string, unknown>>(
    `
    SELECT
      id,
      device_type,
      plan_symbol,
      device_name,
      manufacturer,
      model_number,
      description,
      common_application,
      mounting_type,
      lumens,
      wattage,
      voltage,
      unit_cost,
      installed_cost,
      image_url,
      installation_photo,
      manufacturer_photo,
      nec_reference
    FROM device_fixture_library
    WHERE ${where.join(" AND ")}
    ORDER BY manufacturer ASC, device_name ASC
    LIMIT $${limitIndex}
    `,
    values
  );

  return result.rows.map((row) => mapRow(row));
}

export async function getFixtureById(companyId: string, fixtureId: string): Promise<FixtureLibraryItem | null> {
  await ensureFixtureLibrarySeeded(companyId);
  const pool = getDbPool();
  const result = await pool.query<Record<string, unknown>>(
    `
    SELECT
      id,
      device_type,
      plan_symbol,
      device_name,
      manufacturer,
      model_number,
      description,
      common_application,
      mounting_type,
      lumens,
      wattage,
      voltage,
      unit_cost,
      installed_cost,
      image_url,
      installation_photo,
      manufacturer_photo,
      nec_reference
    FROM device_fixture_library
    WHERE company_id = $1
      AND id = $2
    LIMIT 1
    `,
    [companyId, fixtureId]
  );

  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

