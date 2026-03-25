"use client";

import { useCallback, useMemo, useState } from "react";
import {
  defaultProjectBreakdownState,
  grandTotals,
  LABOR_PRESETS,
  laborLineCost,
  laborLineCustomerPrice,
  laborLineProfit,
  MATERIAL_PRESETS,
  materialLineCustomerPrice,
  materialLineMarkupPct,
  materialLineProfit,
  newPbId,
  type LaborPreset,
  type MaterialPreset,
  type PBLaborLine,
  type PBMaterialLine,
  type ProjectBreakdownState,
} from "@/lib/project-breakdown";
import {
  buildProjectBreakdownCsv,
  downloadProjectBreakdownPdf,
} from "@/lib/project-breakdown-export";
import { equipmentOptionsForSlot } from "@/lib/pb-equipment-options";
import { formatMoneyCell, formatUsd } from "@/lib/wifi-project-cost";

const th =
  "bg-[#E8C84A]/15 text-left text-[10px] font-bold uppercase tracking-wide text-[#E8C84A]";

type Props = {
  variant: "compact" | "full";
  state: ProjectBreakdownState;
  onChange: (next: ProjectBreakdownState) => void;
  projectTitle: string;
  /** Override Wi‑Fi material presets (e.g. AV / smart home tools). */
  materialPresetList?: MaterialPreset[];
  laborPresetList?: LaborPreset[];
  /** When false, hide the equipment/BOM column (non–Wi‑Fi breakdowns). */
  showEquipmentColumn?: boolean;
};

export function ProjectBreakdownEditor({
  variant,
  state,
  onChange,
  projectTitle,
  materialPresetList,
  laborPresetList,
  showEquipmentColumn = true,
}: Props) {
  const matList = materialPresetList ?? MATERIAL_PRESETS;
  const labList = laborPresetList ?? LABOR_PRESETS;
  const showEq = showEquipmentColumn;

  const [pdfBusy, setPdfBusy] = useState(false);
  const [matPreset, setMatPreset] = useState(matList[0]!.id);
  const [matDesc, setMatDesc] = useState(matList[0]!.label);
  const [matQty, setMatQty] = useState(1);
  const [matUnit, setMatUnit] = useState(matList[0]!.unit);
  const [matUnitCost, setMatUnitCost] = useState(matList[0]!.defaultUnitCost);
  const [matMarkup, setMatMarkup] = useState<number | "">("");
  const [showMatForm, setShowMatForm] = useState(false);

  const [labPreset, setLabPreset] = useState(labList[0]!.id);
  const [labTask, setLabTask] = useState(labList[0]!.label);
  const [labHours, setLabHours] = useState(labList[0]!.defaultHours);
  const [labTechs, setLabTechs] = useState<number | "">("");
  const [labRate, setLabRate] = useState<number | "">("");
  const [showLabForm, setShowLabForm] = useState(false);

  const [matEditId, setMatEditId] = useState<string | null>(null);
  const [labEditId, setLabEditId] = useState<string | null>(null);

  const g = useMemo(() => grandTotals(state), [state]);

  const patch = useCallback(
    (partial: Partial<ProjectBreakdownState>) => {
      onChange({ ...state, ...partial });
    },
    [onChange, state],
  );

  const applyMatPreset = (id: string) => {
    setMatPreset(id);
    const p = matList.find((x) => x.id === id);
    if (!p) return;
    if (id !== "custom") {
      setMatDesc(p.label);
      setMatUnit(p.unit);
      setMatUnitCost(p.defaultUnitCost);
    }
  };

  const applyLabPreset = (id: string) => {
    setLabPreset(id);
    const p = labList.find((x) => x.id === id);
    if (!p) return;
    if (id !== "custom") {
      setLabTask(p.label);
      setLabHours(p.defaultHours);
    }
  };

  const addMaterial = () => {
    const line: PBMaterialLine = {
      id: newPbId(),
      description: matDesc.trim() || "Item",
      qty: Math.max(0, matQty),
      unit: matUnit.trim() || "EA",
      unitCost: Math.max(0, matUnitCost),
      markupPct: matMarkup === "" ? null : Number(matMarkup),
      bomSlot: null,
      equipOptionId: null,
    };
    onChange({ ...state, materials: [...state.materials, line] });
    setShowMatForm(false);
    setMatMarkup("");
  };

  const addLabor = () => {
    const line: PBLaborLine = {
      id: newPbId(),
      task: labTask.trim() || "Task",
      hours: Math.max(0, labHours),
      techs: labTechs === "" ? null : Number(labTechs),
      ratePerHour: labRate === "" ? null : Number(labRate),
    };
    onChange({ ...state, labor: [...state.labor, line] });
    setShowLabForm(false);
    setLabTechs("");
    setLabRate("");
  };

  const updateMaterial = (id: string, partial: Partial<PBMaterialLine>) => {
    onChange({
      ...state,
      materials: state.materials.map((m) =>
        m.id === id ? { ...m, ...partial } : m,
      ),
    });
  };

  const updateLabor = (id: string, partial: Partial<PBLaborLine>) => {
    onChange({
      ...state,
      labor: state.labor.map((L) => (L.id === id ? { ...L, ...partial } : L)),
    });
  };

  const deleteMaterial = (id: string) => {
    onChange({
      ...state,
      materials: state.materials.filter((m) => m.id !== id),
    });
    if (matEditId === id) setMatEditId(null);
  };

  const applyEquipPick = (m: PBMaterialLine, optionId: string) => {
    if (!m.bomSlot || !state.wifiVendor) return;
    const opts = equipmentOptionsForSlot(m.bomSlot, state.wifiVendor);
    const opt = opts?.find((o) => o.id === optionId);
    if (!opt) return;
    let unitCost = opt.unitPrice;
    let description = m.description;
    if (m.bomSlot === "indoor-ap") {
      description = `Wireless indoor AP — ${opt.label} ($${opt.unitPrice})`;
    } else if (m.bomSlot === "outdoor-ap") {
      description = `Wireless outdoor AP — ${opt.label} ($${opt.unitPrice})`;
    } else if (m.bomSlot === "poe-switch") {
      if (state.wifiVendor === "tp_link") {
        unitCost = opt.unitPrice + 29;
        description = `PoE switch — ${opt.label} · TP-Link Omada OC200 hardware controller ($29)`;
      } else {
        description = `PoE switch — ${opt.label}`;
      }
    }
    updateMaterial(m.id, {
      unitCost,
      description,
      equipOptionId: optionId,
    });
  };

  const deleteLabor = (id: string) => {
    onChange({
      ...state,
      labor: state.labor.filter((L) => L.id !== id),
    });
    if (labEditId === id) setLabEditId(null);
  };

  const sectionWrap =
    variant === "full"
      ? "rounded-xl border border-white/10 bg-white/[0.03] p-5"
      : "";

  return (
    <div className={variant === "full" ? "space-y-8" : "space-y-5"}>
      <div
        className={`flex flex-wrap items-end gap-4 ${variant === "full" ? "rounded-xl border border-[#E8C84A]/25 bg-[#0a1628]/60 p-4" : ""}`}
      >
        <label className="text-xs text-white/70">
          Overall material markup %
          <input
            type="number"
            className="mt-1 block w-20 rounded border border-white/15 bg-[#0a1628] px-2 py-1.5 text-white"
            value={state.materialMarkupPct}
            onChange={(e) =>
              patch({ materialMarkupPct: Number(e.target.value) || 0 })
            }
          />
        </label>
        <label className="text-xs text-white/70">
          Technicians
          <input
            type="number"
            min={1}
            className="mt-1 block w-20 rounded border border-white/15 bg-[#0a1628] px-2 py-1.5 text-white"
            value={state.technicianCount}
            onChange={(e) =>
              patch({ technicianCount: Math.max(1, Number(e.target.value) || 1) })
            }
          />
        </label>
        <label className="text-xs text-white/70">
          Labor rate $/hr
          <div className="mt-1 flex items-center gap-1">
            <span className="text-white/50">$</span>
            <input
              type="number"
              className="w-24 rounded border border-white/15 bg-[#0a1628] px-2 py-1.5 text-white"
              value={state.laborRatePerHour}
              onChange={(e) =>
                patch({
                  laborRatePerHour: Math.max(0, Number(e.target.value) || 0),
                })
              }
            />
          </div>
        </label>
        <label className="text-xs text-white/70">
          Labor markup %
          <input
            type="number"
            className="mt-1 block w-20 rounded border border-white/15 bg-[#0a1628] px-2 py-1.5 text-white"
            value={state.laborMarkupPct}
            onChange={(e) =>
              patch({ laborMarkupPct: Number(e.target.value) || 0 })
            }
          />
        </label>
        <label className="text-xs text-white/70">
          Sales tax rate % (materials only, after markup)
          <input
            type="number"
            step={0.001}
            className="mt-1 block w-24 rounded border border-white/15 bg-[#0a1628] px-2 py-1.5 text-white"
            value={state.salesTaxPct}
            onChange={(e) =>
              patch({ salesTaxPct: Math.max(0, Number(e.target.value) || 0) })
            }
          />
        </label>
      </div>

      <details
        className={sectionWrap}
        open={variant === "full"}
      >
        <summary className="cursor-pointer text-sm font-semibold text-[#E8C84A]">
          Materials
        </summary>
        <div className={variant === "full" ? "mt-4" : "mt-3"}>
          <div className="table-scroll-wrap overflow-x-auto rounded-lg border border-[#E8C84A]/25">
            <table
              className={`w-full border-collapse text-sm text-white/90 ${showEq ? "min-w-[820px]" : "min-w-[680px]"}`}
            >
              <thead>
                <tr className={th}>
                  {showEq ? (
                    <th className="px-2 py-2">Equipment</th>
                  ) : null}
                  <th className="px-2 py-2">Description</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2">Unit</th>
                  <th className="px-2 py-2 text-right">Unit cost</th>
                  <th className="px-2 py-2 text-right">Markup%</th>
                  <th className="px-2 py-2 text-right">Customer price</th>
                  <th className="px-2 py-2 text-right">Profit</th>
                  <th className="px-2 py-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.materials.map((m) => {
                  const equipOpts =
                    m.bomSlot && state.wifiVendor
                      ? equipmentOptionsForSlot(m.bomSlot, state.wifiVendor)
                      : null;
                  return (
                  <tr
                    key={m.id}
                    className="border-t border-white/8 odd:bg-white/[0.03]"
                  >
                    {matEditId === m.id ? (
                      <>
                        {showEq ? (
                          <td className="px-2 py-2 align-top text-white/45">
                            {equipOpts ? (
                              <select
                                className="max-w-[10rem] rounded border border-white/20 bg-[#0a1628] px-1 py-1 text-xs text-white"
                                value={m.equipOptionId ?? ""}
                                onChange={(e) =>
                                  applyEquipPick(m, e.target.value)
                                }
                              >
                                {equipOpts.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.label} — ${o.unitPrice}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              "—"
                            )}
                          </td>
                        ) : null}
                        <td className="px-2 py-2">
                          <input
                            className="w-full rounded border border-white/20 bg-[#0a1628] px-2 py-1 text-sm"
                            value={m.description}
                            onChange={(e) =>
                              updateMaterial(m.id, {
                                description: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            className="w-full rounded border border-white/20 bg-[#0a1628] px-2 py-1 text-right text-sm"
                            value={m.qty}
                            onChange={(e) =>
                              updateMaterial(m.id, {
                                qty: Number(e.target.value) || 0,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="w-full rounded border border-white/20 bg-[#0a1628] px-2 py-1 text-sm"
                            value={m.unit}
                            onChange={(e) =>
                              updateMaterial(m.id, { unit: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            className="w-full rounded border border-white/20 bg-[#0a1628] px-2 py-1 text-right text-sm"
                            value={m.unitCost}
                            onChange={(e) =>
                              updateMaterial(m.id, {
                                unitCost: Number(e.target.value) || 0,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            placeholder={`${state.materialMarkupPct}`}
                            className="w-full rounded border border-white/20 bg-[#0a1628] px-2 py-1 text-right text-sm"
                            value={m.markupPct ?? ""}
                            onChange={(e) =>
                              updateMaterial(m.id, {
                                markupPct:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-[#E8C84A]">
                          {formatMoneyCell(
                            materialLineCustomerPrice(
                              m,
                              state.materialMarkupPct,
                            ),
                          )}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatMoneyCell(
                            materialLineProfit(m, state.materialMarkupPct),
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            className="text-xs text-sky-300 hover:underline"
                            onClick={() => setMatEditId(null)}
                          >
                            Done
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        {showEq ? (
                          <td className="max-w-[10rem] px-2 py-2 align-top">
                            {equipOpts && m.qty > 0 ? (
                              <select
                                className="w-full max-w-[10rem] rounded border border-[#E8C84A]/35 bg-[#0a1628] px-1 py-1.5 text-xs text-white"
                                value={
                                  m.equipOptionId ??
                                  equipOpts[0]?.id ??
                                  ""
                                }
                                onChange={(e) =>
                                  applyEquipPick(m, e.target.value)
                                }
                              >
                                {equipOpts.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.label} — ${o.unitPrice}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-white/35">—</span>
                            )}
                          </td>
                        ) : null}
                        <td className="max-w-[200px] px-2 py-2">{m.description}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {m.qty}
                        </td>
                        <td className="px-2 py-2 text-white/70">{m.unit}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-[#E8C84A]/95">
                          {formatMoneyCell(m.unitCost)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-white/75">
                          {m.markupPct ?? state.materialMarkupPct}
                          {m.markupPct == null ? " *" : ""}
                        </td>
                        <td className="px-2 py-2 text-right font-medium tabular-nums text-[#E8C84A]">
                          {formatMoneyCell(
                            materialLineCustomerPrice(
                              m,
                              state.materialMarkupPct,
                            ),
                          )}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatMoneyCell(
                            materialLineProfit(m, state.materialMarkupPct),
                          )}
                        </td>
                        <td className="space-x-2 px-2 py-2 text-center">
                          <button
                            type="button"
                            className="text-xs text-sky-300 hover:underline"
                            onClick={() => setMatEditId(m.id)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-xs text-red-300 hover:underline"
                            onClick={() => deleteMaterial(m.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="mt-3 rounded-lg border border-[#E8C84A]/45 bg-[#E8C84A]/10 px-3 py-2 text-sm font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/20"
            onClick={() => setShowMatForm((v) => !v)}
          >
            + Add material item
          </button>
          {showMatForm ? (
            <div className="mt-3 grid gap-3 rounded-lg border border-white/10 bg-[#0a1628]/80 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block text-xs text-white/70 sm:col-span-2 lg:col-span-3">
                Preset
                <select
                  className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-2 text-white"
                  value={matPreset}
                  onChange={(e) => applyMatPreset(e.target.value)}
                >
                  {matList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-white/70">
                Description
                <input
                  className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-2 text-white"
                  value={matDesc}
                  onChange={(e) => setMatDesc(e.target.value)}
                />
              </label>
              <label className="text-xs text-white/70">
                Qty
                <input
                  type="number"
                  className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-2 text-white"
                  value={matQty}
                  onChange={(e) => setMatQty(Number(e.target.value) || 0)}
                />
              </label>
              <label className="text-xs text-white/70">
                Unit
                <input
                  className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-2 text-white"
                  value={matUnit}
                  onChange={(e) => setMatUnit(e.target.value)}
                />
              </label>
              <label className="text-xs text-white/70">
                Unit cost
                <input
                  type="number"
                  step={0.01}
                  className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-2 text-white"
                  value={matUnitCost}
                  onChange={(e) =>
                    setMatUnitCost(Number(e.target.value) || 0)
                  }
                />
              </label>
              <label className="text-xs text-white/70">
                Markup % (blank = overall)
                <input
                  type="number"
                  className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-2 text-white"
                  value={matMarkup}
                  placeholder={String(state.materialMarkupPct)}
                  onChange={(e) =>
                    setMatMarkup(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                />
              </label>
              <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
                <button
                  type="button"
                  className="rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-semibold text-[#0a1628]"
                  onClick={addMaterial}
                >
                  Save line
                </button>
                <button
                  type="button"
                  className="text-sm text-white/60 hover:text-white"
                  onClick={() => setShowMatForm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </details>

      <details className={sectionWrap} open={variant === "full"}>
        <summary className="cursor-pointer text-sm font-semibold text-[#E8C84A]">
          Labor
        </summary>
        <div className={variant === "full" ? "mt-4" : "mt-3"}>
          <div className="table-scroll-wrap overflow-x-auto rounded-lg border border-[#E8C84A]/25">
            <table className="w-full min-w-[680px] border-collapse text-sm text-white/90">
              <thead>
                <tr className={th}>
                  <th className="px-2 py-2">Task</th>
                  <th className="px-2 py-2 text-right">Hours</th>
                  <th className="px-2 py-2 text-right">Techs</th>
                  <th className="px-2 py-2 text-right">Rate/hr</th>
                  <th className="px-2 py-2 text-right">Cost</th>
                  <th className="px-2 py-2 text-right">Customer price</th>
                  <th className="px-2 py-2 text-right">Profit</th>
                  <th className="px-2 py-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.labor.map((L) => (
                  <tr
                    key={L.id}
                    className="border-t border-white/8 odd:bg-white/[0.03]"
                  >
                    {labEditId === L.id ? (
                      <>
                        <td className="px-2 py-2">
                          <input
                            className="w-full rounded border border-white/20 bg-[#0a1628] px-2 py-1 text-sm"
                            value={L.task}
                            onChange={(e) =>
                              updateLabor(L.id, { task: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            className="w-full rounded border border-white/20 bg-[#0a1628] px-2 py-1 text-right text-sm"
                            value={L.hours}
                            onChange={(e) =>
                              updateLabor(L.id, {
                                hours: Number(e.target.value) || 0,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            placeholder={String(state.technicianCount)}
                            className="w-full rounded border border-white/20 bg-[#0a1628] px-2 py-1 text-right text-sm"
                            value={L.techs ?? ""}
                            onChange={(e) =>
                              updateLabor(L.id, {
                                techs:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            placeholder={String(state.laborRatePerHour)}
                            className="w-full rounded border border-white/20 bg-[#0a1628] px-2 py-1 text-right text-sm"
                            value={L.ratePerHour ?? ""}
                            onChange={(e) =>
                              updateLabor(L.id, {
                                ratePerHour:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-emerald-200">
                          {formatMoneyCell(
                            laborLineCost(
                              L,
                              state.technicianCount,
                              state.laborRatePerHour,
                            ),
                          )}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-emerald-200">
                          {formatMoneyCell(laborLineCustomerPrice(L, state))}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatMoneyCell(laborLineProfit(L, state))}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            className="text-xs text-sky-300 hover:underline"
                            onClick={() => setLabEditId(null)}
                          >
                            Done
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="max-w-[220px] px-2 py-2">{L.task}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {L.hours}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-white/75">
                          {L.techs ?? state.technicianCount}
                          {L.techs == null ? " *" : ""}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-emerald-200/90">
                          {formatMoneyCell(
                            L.ratePerHour ?? state.laborRatePerHour,
                          )}
                          /hr
                        </td>
                        <td className="px-2 py-2 text-right font-medium tabular-nums text-emerald-200">
                          {formatMoneyCell(
                            laborLineCost(
                              L,
                              state.technicianCount,
                              state.laborRatePerHour,
                            ),
                          )}
                        </td>
                        <td className="px-2 py-2 text-right font-medium tabular-nums text-emerald-200">
                          {formatMoneyCell(laborLineCustomerPrice(L, state))}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatMoneyCell(laborLineProfit(L, state))}
                        </td>
                        <td className="space-x-2 px-2 py-2 text-center">
                          <button
                            type="button"
                            className="text-xs text-sky-300 hover:underline"
                            onClick={() => setLabEditId(L.id)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-xs text-red-300 hover:underline"
                            onClick={() => deleteLabor(L.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="mt-3 rounded-lg border border-emerald-500/45 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20"
            onClick={() => setShowLabForm((v) => !v)}
          >
            + Add labor item
          </button>
          {showLabForm ? (
            <div className="mt-3 grid gap-3 rounded-lg border border-white/10 bg-[#0a1628]/80 p-4 sm:grid-cols-2">
              <label className="block text-xs text-white/70 sm:col-span-2">
                Preset
                <select
                  className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-2 text-white"
                  value={labPreset}
                  onChange={(e) => applyLabPreset(e.target.value)}
                >
                  {labList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-white/70 sm:col-span-2">
                Task
                <input
                  className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-2 text-white"
                  value={labTask}
                  onChange={(e) => setLabTask(e.target.value)}
                />
              </label>
              <label className="text-xs text-white/70">
                Hours
                <input
                  type="number"
                  step={0.25}
                  className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-2 text-white"
                  value={labHours}
                  onChange={(e) =>
                    setLabHours(Number(e.target.value) || 0)
                  }
                />
              </label>
              <label className="text-xs text-white/70">
                Techs (blank = overall)
                <input
                  type="number"
                  className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-2 text-white"
                  value={labTechs}
                  placeholder={String(state.technicianCount)}
                  onChange={(e) =>
                    setLabTechs(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                />
              </label>
              <label className="text-xs text-white/70 sm:col-span-2">
                Rate/hr (blank = overall)
                <input
                  type="number"
                  className="mt-1 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-2 text-white"
                  value={labRate}
                  placeholder={String(state.laborRatePerHour)}
                  onChange={(e) =>
                    setLabRate(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                />
              </label>
              <div className="flex items-end gap-2 sm:col-span-2">
                <button
                  type="button"
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                  onClick={addLabor}
                >
                  Save line
                </button>
                <button
                  type="button"
                  className="text-sm text-white/60 hover:text-white"
                  onClick={() => setShowLabForm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </details>

      <div
        className={
          variant === "full"
            ? "rounded-xl border-2 border-[#E8C84A]/40 bg-[#0a1628]/80 p-6"
            : "border-t-2 border-[#E8C84A]/45 pt-5"
        }
      >
        <h3 className="text-sm font-bold uppercase tracking-wide text-[#E8C84A]">
          Totals
        </h3>
        <div className="table-scroll-wrap mt-4 overflow-x-auto">
          <table className="w-full min-w-[320px] border-collapse text-sm">
            <tbody className="text-white/88">
              <tr className="border-t border-white/10">
                <td className="px-2 py-2 text-white/70">Materials (your cost)</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatMoneyCell(g.materials.cost)}
                </td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-2 py-2 text-white/70">Materials (after markup)</td>
                <td className="px-2 py-2 text-right tabular-nums text-[#E8C84A]">
                  {formatMoneyCell(g.materialsCustomerAfterMarkup)}
                </td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-2 py-2 text-white/70">
                  Sales tax ({state.salesTaxPct}%)
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatMoneyCell(g.materialsTaxAmount)}
                </td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-2 py-2 text-white/70">Materials with tax</td>
                <td className="px-2 py-2 text-right tabular-nums text-[#E8C84A]">
                  {formatMoneyCell(g.materialsWithTaxCustomer)}
                </td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-2 py-2 text-white/70">
                  Labor (no sales tax)
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-emerald-200">
                  {formatMoneyCell(g.laborCustomerPrice)}
                </td>
              </tr>
              <tr className="border-t-2 border-[#E8C84A]/40 font-bold">
                <td className="px-2 py-3 text-white">TOTAL</td>
                <td className="px-2 py-3 text-right tabular-nums text-white">
                  {formatMoneyCell(g.grandCustomer)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-4 space-y-1 border-t border-white/10 pt-4 text-sm text-white/80">
          <p>
            Total cost (your cost):{" "}
            <span className="font-medium tabular-nums text-white">
              {formatMoneyCell(g.totalCostBasis)}
            </span>
          </p>
          <p>
            Total customer price:{" "}
            <span className="font-medium tabular-nums text-[#E8C84A]">
              {formatMoneyCell(g.totalCustomerPrice)}
            </span>
          </p>
          <p>
            Total profit:{" "}
            <span className="font-medium tabular-nums text-emerald-200">
              {formatMoneyCell(g.totalProfit)}
            </span>
          </p>
          <p className="font-medium text-[#E8C84A]">
            Overall margin: {g.overallMarginPct}%
          </p>
        </div>
        <p className="mt-3 text-xs text-white/45">
          Sales tax applies to materials customer price only (after markup), not
          labor.
        </p>
        <p className="mt-2 text-lg font-bold text-white">
          Cost basis: {formatUsd(g.totalLow)} · Customer total:{" "}
          {formatUsd(g.totalHigh)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pdfBusy}
          onClick={() => {
            setPdfBusy(true);
            void downloadProjectBreakdownPdf(state, projectTitle).finally(() =>
              setPdfBusy(false),
            );
          }}
          className="rounded-lg border border-[#E8C84A]/50 bg-[#E8C84A]/15 px-4 py-2 text-sm font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/25 disabled:opacity-50"
        >
          {pdfBusy ? "PDF…" : "Export PDF"}
        </button>
        <button
          type="button"
          onClick={() => {
            const csv = buildProjectBreakdownCsv(state, projectTitle);
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `project-breakdown-${projectTitle.replace(/\s+/g, "-") || "export"}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
        >
          Export CSV
        </button>
        {variant === "full" ? (
          <button
            type="button"
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/70 hover:bg-white/5"
            onClick={() => onChange(defaultProjectBreakdownState())}
          >
            Clear all lines
          </button>
        ) : null}
      </div>
    </div>
  );
}
