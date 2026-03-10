import type { DedicatedCircuit, PanelScheduleRow } from "@package/types";

export function estimateDedicatedCircuits(): DedicatedCircuit[] {
  return [
    { area: "Kitchen", circuitDescription: "Small appliance circuit A", breakerType: "20A AFCI/GFCI", wireSize: "12 AWG Cu" },
    { area: "Kitchen", circuitDescription: "Small appliance circuit B", breakerType: "20A AFCI/GFCI", wireSize: "12 AWG Cu" },
    { area: "Kitchen", circuitDescription: "Refrigerator", breakerType: "20A", wireSize: "12 AWG Cu" },
    { area: "Kitchen", circuitDescription: "Dishwasher", breakerType: "20A", wireSize: "12 AWG Cu" },
    { area: "Kitchen", circuitDescription: "Microwave", breakerType: "20A", wireSize: "12 AWG Cu" },
    { area: "Kitchen", circuitDescription: "Disposal", breakerType: "15A", wireSize: "14 AWG Cu" },
    { area: "Laundry", circuitDescription: "Washer", breakerType: "20A", wireSize: "12 AWG Cu" },
    { area: "Laundry", circuitDescription: "Dryer", breakerType: "30A 2P", wireSize: "10 AWG Cu" },
    { area: "Bathroom", circuitDescription: "GFCI receptacle circuit", breakerType: "20A GFCI", wireSize: "12 AWG Cu" },
    { area: "Garage", circuitDescription: "EV charger provision", breakerType: "50A 2P", wireSize: "6 AWG Cu" },
    { area: "HVAC", circuitDescription: "Air handler/condensing unit", breakerType: "Per nameplate", wireSize: "Per load calc" }
  ];
}

export function generatePanelSchedule(circuits: DedicatedCircuit[]): PanelScheduleRow[] {
  return circuits.map((circuit, index) => ({
    circuit: `C-${index + 1}`,
    breakerSize: circuit.breakerType,
    wireType: circuit.wireSize,
    loadDescription: `${circuit.area}: ${circuit.circuitDescription}`
  }));
}

