"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ToolPageHeader } from "@/components/tool-page-header";
import { useThemedPageShell } from "@/lib/theme-context";
import { downloadElectricalReferenceSheetsPdf } from "@/lib/electrical-reference-all-pdf";
import {
  AMPACITY_CHEAT,
  type AmbientF,
  type AwgKey,
  type ConductorCountGroup,
  type ConduitFillWire,
  type ConduitTrade,
  CONDUIT_FILL_CHEAT_EMT,
  computeConduitFill,
  computeVoltageDrop,
  computeWireAmpacity,
  type InstallChoice,
  type InsulationChoice,
} from "@/lib/electrical-reference-engine";

function printRefCard(elementId: string, title: string, necLine: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title><style>
    body{font-family:system-ui,sans-serif;padding:28px;color:#111;max-width:720px;margin:0 auto;}
    .brand{color:#a88416;font-weight:700;font-size:14px;margin:0 0 8px;}
    h1{font-size:20px;border-bottom:2px solid #c9a227;padding-bottom:10px;color:#0a1628;}
    table{border-collapse:collapse;width:100%;font-size:12px;margin-top:12px;}
    th,td{border:1px solid #ccc;padding:6px;text-align:left;}
    ul{font-size:13px;line-height:1.5;}
    footer{margin-top:28px;font-size:11px;color:#555;border-top:1px solid #ddd;padding-top:12px;}
  </style></head><body>
  <p class="brand">TPP Electric</p>
  <h1>${title}</h1>
  ${el.innerHTML}
  <footer><strong>NEC:</strong> ${necLine}<br/>Printed ${new Date().toLocaleString()}</footer>
  </body></html>`);
  w.document.close();
  w.focus();
  w.print();
  w.close();
}

const AWG_OPTIONS: AwgKey[] = [
  "14",
  "12",
  "10",
  "8",
  "6",
  "4",
  "3",
  "2",
  "1",
  "1/0",
  "2/0",
  "3/0",
  "4/0",
  "250",
  "300",
  "350",
  "400",
  "500",
];

const TRADE_SIZES: ConduitTrade[] = [
  '1/2"',
  '3/4"',
  '1"',
  '1-1/4"',
  '1-1/2"',
  '2"',
  '2-1/2"',
  '3"',
  '3-1/2"',
  '4"',
];

export function ElectricalReferenceClient() {
  const shell = useThemedPageShell();

  const [awg, setAwg] = useState<AwgKey>("12");
  const [material, setMaterial] = useState<"copper" | "aluminum">("copper");
  const [insulation, setInsulation] = useState<InsulationChoice>("thhn90");
  const [installation, setInstallation] = useState<InstallChoice>("conduit");
  const [countGrp, setCountGrp] = useState<ConductorCountGroup>("1-3");
  const [ambient, setAmbient] = useState<AmbientF>(86);

  const ampRes = useMemo(
    () =>
      computeWireAmpacity({
        awg,
        material,
        insulation,
        installation,
        conductorGroup: countGrp,
        ambientF: ambient,
      }),
    [awg, material, insulation, installation, countGrp, ambient],
  );

  const [cType, setCType] = useState("EMT");
  const [cSize, setCSize] = useState<ConduitTrade>('3/4"');
  const [wires, setWires] = useState<ConduitFillWire[]>([
    { awg: "12", qty: 3, insulation: "thhn" },
  ]);

  const fillRes = useMemo(
    () => computeConduitFill({ conduitType: cType, tradeSize: cSize, wires }),
    [cType, cSize, wires],
  );

  const [vdV, setVdV] = useState(240);
  const [vdPhase, setVdPhase] = useState<"single" | "three">("single");
  const [vdMat, setVdMat] = useState<"copper" | "aluminum">("copper");
  const [vdAwg, setVdAwg] = useState<AwgKey>("12");
  const [vdFt, setVdFt] = useState(75);
  const [vdA, setVdA] = useState(16);

  const vdRes = useMemo(
    () =>
      computeVoltageDrop({
        voltage: vdV,
        phase: vdPhase,
        material: vdMat,
        awg: vdAwg,
        distanceFt: vdFt,
        amps: vdA,
      }),
    [vdV, vdPhase, vdMat, vdAwg, vdFt, vdA],
  );

  const [openCards, setOpenCards] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      ["c1", "c2", "c3", "c4", "c5", "c6", "c7"].map((k) => [k, true]),
    ),
  );

  const toggleCard = (k: string) =>
    setOpenCards((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div className={shell}>
      <ToolPageHeader
        title="Electrical Reference"
        subtitle="NEC-oriented calculators & cheat sheets (verify AHJ)"
      >
        <div className="flex flex-wrap gap-2">
          <Link
            href="/tools/motor-hvac-calculator"
            className="rounded-lg border border-amber-500/45 bg-amber-950/30 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-950/45"
          >
            Motor / HVAC
          </Link>
          <Link
            href="/tools/nec-checker"
            className="rounded-lg border border-violet-500/45 bg-violet-950/35 px-3 py-2 text-sm font-medium text-violet-100 hover:bg-violet-950/50"
          >
            NEC Checker
          </Link>
          <Link
            href="/tools"
            className="rounded-lg border border-white/20 px-3 py-2 text-sm font-medium text-[#E8C84A] hover:bg-white/5"
          >
            ← Tools
          </Link>
        </div>
      </ToolPageHeader>

      <main className="mx-auto max-w-4xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="tool-muted max-w-xl text-sm">
            Rule-based math only — not a substitute for the NEC in force or
            licensed design.
          </p>
          <button
            type="button"
            onClick={() => void downloadElectricalReferenceSheetsPdf()}
            className="rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-semibold text-[#0a1628] hover:bg-[#f0d56e]"
          >
            Export all reference sheets (PDF)
          </button>
        </div>

        {/* Section 1 */}
        <section className="tool-surface-card space-y-4 p-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            1 — Wire ampacity
          </h2>
          <p className="tool-muted text-xs">
            NEC Table 310.12 (cheat) · 310.15(B) temp · 310.15(C)(1) conductor
            bundling
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">
              <span className="tool-muted block">Wire gauge</span>
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={awg}
                onChange={(e) => setAwg(e.target.value as AwgKey)}
              >
                {AWG_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a} {a.includes("/") || Number(a) > 9 ? "AWG/kcmil" : "AWG"}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="tool-muted block">Material</span>
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={material}
                onChange={(e) =>
                  setMaterial(e.target.value as "copper" | "aluminum")
                }
              >
                <option value="copper">Copper</option>
                <option value="aluminum">Aluminum</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="tool-muted block">Insulation</span>
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={insulation}
                onChange={(e) =>
                  setInsulation(e.target.value as InsulationChoice)
                }
              >
                <option value="thhn90">THHN/THWN-2 (90°C)</option>
                <option value="thwn75">THWN (75°C)</option>
                <option value="tw60">TW/UF (60°C)</option>
                <option value="nmb60">NM-B (60°C)</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="tool-muted block">Installation</span>
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={installation}
                onChange={(e) =>
                  setInstallation(e.target.value as InstallChoice)
                }
              >
                <option value="conduit">In conduit</option>
                <option value="freeair">Free air</option>
                <option value="buried">Direct buried</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="tool-muted block">Current-carrying conductors</span>
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={countGrp}
                onChange={(e) =>
                  setCountGrp(e.target.value as ConductorCountGroup)
                }
              >
                <option value="1-3">3 or fewer</option>
                <option value="4-6">4–6</option>
                <option value="7-9">7–9</option>
                <option value="10-20">10–20</option>
                <option value="21-30">21–30</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="tool-muted block">Ambient temperature</span>
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={ambient}
                onChange={(e) => setAmbient(Number(e.target.value) as AmbientF)}
              >
                <option value={86}>86°F (30°C)</option>
                <option value={95}>95°F</option>
                <option value={104}>104°F</option>
                <option value={113}>113°F</option>
                <option value={122}>122°F</option>
                <option value={131}>131°F</option>
                <option value={140}>140°F</option>
              </select>
            </label>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm">
            <ul className="space-y-1">
              <li>Base ampacity: {ampRes.baseAmpacity} A</li>
              <li>Temperature correction: {ampRes.tempFactor}</li>
              <li>Conduit derating (conductors): {ampRes.conduitDerateFactor}</li>
              <li>Installation factor: {ampRes.installFactor}</li>
              <li className="font-semibold">
                Final adjusted ampacity: {ampRes.finalAmpacity} A
              </li>
              <li>Minimum breaker size: {ampRes.minBreaker} A</li>
              <li>NEC ref.: {ampRes.necRef}</li>
            </ul>
            {ampRes.notes.map((n) => (
              <p key={n} className="mt-2 text-xs text-amber-200/90">
                {n}
              </p>
            ))}
          </div>

          <div className="overflow-x-auto">
            <h3 className="tool-muted mb-2 text-xs font-semibold uppercase tracking-wide">
              Ampacity cheat sheet
            </h3>
            <table className="w-full min-w-[480px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-white/15">
                  <th className="p-2">AWG</th>
                  <th className="p-2">Cu 60°C</th>
                  <th className="p-2">Cu 75°C</th>
                  <th className="p-2">Cu 90°C</th>
                  <th className="p-2">Al 75°C</th>
                </tr>
              </thead>
              <tbody>
                {AWG_OPTIONS.map((k) => {
                  const r = AMPACITY_CHEAT[k];
                  return (
                    <tr key={k} className="border-b border-white/10">
                      <td className="p-2 font-mono">{k}</td>
                      <td className="p-2">{r.cu60}A</td>
                      <td className="p-2">{r.cu75}A</td>
                      <td className="p-2">{r.cu90}A</td>
                      <td className="p-2">{r.al75 == null ? "—" : `${r.al75}A`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 2 */}
        <section className="tool-surface-card space-y-4 p-6">
          <h2 className="text-lg font-semibold">2 — Conduit fill</h2>
          <p className="tool-muted text-xs">NEC Chapter 9 Tables 4 & 5 (ref.)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="tool-muted block">Conduit type</span>
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={cType}
                onChange={(e) => setCType(e.target.value)}
              >
                {[
                  "EMT",
                  "IMC",
                  "RMC",
                  "PVC Sch 40",
                  "PVC Sch 80",
                  "FMC",
                  "LFMC",
                ].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="tool-muted block">Trade size</span>
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={cSize}
                onChange={(e) => setCSize(e.target.value as ConduitTrade)}
              >
                {TRADE_SIZES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="space-y-2">
            {wires.map((w, i) => (
              <div
                key={i}
                className="flex flex-wrap items-end gap-2 rounded-lg border border-white/10 p-2"
              >
                <label className="text-sm">
                  Gauge
                  <select
                    className="tool-field ml-1 px-2 py-1"
                    value={w.awg}
                    onChange={(e) => {
                      const v = e.target.value as AwgKey;
                      setWires((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, awg: v } : x)),
                      );
                    }}
                  >
                    {AWG_OPTIONS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Qty
                  <input
                    type="number"
                    min={1}
                    className="tool-field ml-1 w-20 px-2 py-1"
                    value={w.qty}
                    onChange={(e) => {
                      const n = Math.max(1, Number(e.target.value) || 1);
                      setWires((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, qty: n } : x)),
                      );
                    }}
                  />
                </label>
                <label className="text-sm">
                  Insulation
                  <select
                    className="tool-field ml-1 px-2 py-1"
                    value={w.insulation}
                    onChange={(e) => {
                      const v = e.target.value as ConduitFillWire["insulation"];
                      setWires((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, insulation: v } : x,
                        ),
                      );
                    }}
                  >
                    <option value="thhn">THHN</option>
                    <option value="thwn">THWN</option>
                    <option value="xhhw">XHHW</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="text-xs text-red-300 hover:underline"
                  onClick={() => setWires((prev) => prev.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="rounded-lg border border-white/20 px-3 py-1.5 text-sm hover:bg-white/5"
              onClick={() =>
                setWires((p) => [
                  ...p,
                  { awg: "12", qty: 1, insulation: "thhn" },
                ])
              }
            >
              Add wire
            </button>
          </div>
          <div className="rounded-xl border border-sky-500/30 bg-sky-950/25 p-4 text-sm">
            <ul className="space-y-1">
              <li>Total wire area: {fillRes.totalWireSqIn} in²</li>
              <li>Conduit usable area (approx.): {fillRes.conduitInternalSqIn} in²</li>
              <li>Fill: {fillRes.fillPct}%</li>
              <li>NEC max fill: {fillRes.maxFillPct}%</li>
              <li className="font-semibold">
                Status: {fillRes.pass ? "PASS" : "OVERFILL"}
              </li>
              {!fillRes.pass && fillRes.suggestTrade ? (
                <li>Suggest larger trade: {fillRes.suggestTrade}</li>
              ) : null}
              <li className="text-xs opacity-80">{fillRes.necRef}</li>
            </ul>
          </div>
          <div className="overflow-x-auto text-xs">
            <h3 className="tool-muted mb-2 font-semibold uppercase">
              THHN in EMT — max conductors (ref.)
            </h3>
            <table className="w-full min-w-[400px] border-collapse">
              <thead>
                <tr className="border-b border-white/15">
                  <th className="p-1 text-left">Size</th>
                  {['1/2"', '3/4"', '1"', '1-1/4"', '1-1/2"', '2"'].map((h) => (
                    <th key={h} className="p-1">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(CONDUIT_FILL_CHEAT_EMT).map(([g, row]) => (
                  <tr key={g} className="border-b border-white/10">
                    <td className="p-1 font-mono">{g}</td>
                    {['1/2"', '3/4"', '1"', '1-1/4"', '1-1/2"', '2"'].map(
                      (sz) => (
                        <td key={sz} className="p-1 text-center">
                          {row[sz as keyof typeof row] ?? "—"}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 3 */}
        <section className="tool-surface-card space-y-4 p-6">
          <h2 className="text-lg font-semibold">3 — Voltage drop</h2>
          <p className="tool-muted text-xs">
            NEC 210.19(A) Informational Note No. 4 — 3% suggestion (branch)
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">
              <span className="tool-muted block">System voltage</span>
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={vdV}
                onChange={(e) => setVdV(Number(e.target.value))}
              >
                {[120, 208, 240, 277, 480].map((v) => (
                  <option key={v} value={v}>
                    {v}V
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="tool-muted block">Phase</span>
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={vdPhase}
                onChange={(e) =>
                  setVdPhase(e.target.value as "single" | "three")
                }
              >
                <option value="single">Single</option>
                <option value="three">Three</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="tool-muted block">Material</span>
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={vdMat}
                onChange={(e) =>
                  setVdMat(e.target.value as "copper" | "aluminum")
                }
              >
                <option value="copper">Copper</option>
                <option value="aluminum">Aluminum</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="tool-muted block">Wire gauge</span>
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={vdAwg}
                onChange={(e) => setVdAwg(e.target.value as AwgKey)}
              >
                {AWG_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="tool-muted block">One-way distance (ft)</span>
              <input
                type="number"
                min={0}
                className="tool-field mt-1 w-full px-2 py-2"
                value={vdFt}
                onChange={(e) => setVdFt(Number(e.target.value))}
              />
            </label>
            <label className="text-sm">
              <span className="tool-muted block">Load (A)</span>
              <input
                type="number"
                min={0}
                className="tool-field mt-1 w-full px-2 py-2"
                value={vdA}
                onChange={(e) => setVdA(Number(e.target.value))}
              />
            </label>
          </div>
          <div className="rounded-xl border border-violet-500/30 bg-violet-950/25 p-4 text-sm">
            <p className="font-mono text-xs opacity-80">{vdRes.formula}</p>
            <ul className="mt-2 space-y-1">
              <li>Voltage drop: {vdRes.vdVolts} V</li>
              <li>Voltage drop %: {vdRes.vdPct}%</li>
              <li>Status: {vdRes.statusLabel}</li>
              <li>Voltage at load: {vdRes.voltageAtLoad} V</li>
              <li>
                Recommended wire for under 3% (from selected size up):{" "}
                {vdRes.recommendedAwgFor3Pct ?? "—"}
              </li>
            </ul>
          </div>
        </section>

        {/* Section 4 — cheat cards */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">4 — Quick reference cards</h2>
          {(
            [
              {
                key: "c1",
                title: "Standard breaker sizes",
                nec: "Standard product sizes — coordinate with 240.6",
                body: (
                  <p className="text-sm">
                    15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110,
                    125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600,
                    800, 1000, 1200 A
                  </p>
                ),
              },
              {
                key: "c2",
                title: "Circuit wire sizes (typical Cu)",
                nec: "NEC 240.4(D); Table 310.12",
                body: (
                  <ul className="list-inside list-disc text-sm">
                    <li>15 A = 14 AWG Cu minimum</li>
                    <li>20 A = 12 AWG Cu minimum</li>
                    <li>30 A = 10 AWG Cu minimum</li>
                    <li>40 A = 8 AWG Cu minimum</li>
                    <li>50 A = 6 AWG Cu minimum</li>
                    <li>60 A = 6 AWG Cu minimum</li>
                    <li>70 A = 4 AWG Cu minimum</li>
                    <li>100 A = 1 AWG Cu</li>
                    <li>125 A = 1/0 AWG Cu</li>
                    <li>150 A = 2/0 AWG Cu</li>
                    <li>200 A = 3/0 AWG Cu</li>
                    <li>400 A = 600 kcmil Cu parallel</li>
                  </ul>
                ),
              },
              {
                key: "c3",
                title: "Conduit sizing (3 THHN, rule-of-thumb)",
                nec: "NEC Chapter 9 — verify fill",
                body: (
                  <ul className="list-inside list-disc text-sm">
                    <li>#14–#12 → 1/2&quot; EMT</li>
                    <li>#10–#8 → 3/4&quot; EMT</li>
                    <li>#6–#4 → 1&quot; EMT</li>
                    <li>#2–#1 → 1-1/4&quot; EMT</li>
                    <li>1/0–2/0 → 1-1/2&quot; EMT</li>
                    <li>3/0–4/0 → 2&quot; EMT</li>
                    <li>250–350 kcmil → 2-1/2&quot; EMT</li>
                    <li>500 kcmil → 3&quot; EMT</li>
                  </ul>
                ),
              },
              {
                key: "c4",
                title: "Derating factors",
                nec: "NEC 310.15(C)(1); 310.15(B)(1)",
                body: (
                  <ul className="text-sm">
                    <li>4–6 conductors: ×0.80</li>
                    <li>7–9: ×0.70</li>
                    <li>10–20: ×0.50</li>
                    <li>21–30: ×0.45</li>
                    <li className="mt-2 font-semibold">
                      Temperature (Cu ref.): 86°F ×1.00 · 95°F ×0.94 · 104°F ×0.88
                      · 113°F ×0.82 · 122°F ×0.75 · 131°F ×0.67 · 140°F ×0.58
                    </li>
                  </ul>
                ),
              },
              {
                key: "c5",
                title: "Motor circuit (NEC 430)",
                nec: "430.22; 430.32; 430.52",
                body: (
                  <ul className="list-inside list-disc text-sm">
                    <li>Minimum conductor = FLA × 125%</li>
                    <li>Max fuse = FLA × 250% (inverse-time CB max)</li>
                    <li>Max breaker = FLA × 250% (inverse-time)</li>
                    <li>Overload = FLA × 115–125% (per 430.32)</li>
                  </ul>
                ),
              },
              {
                key: "c6",
                title: "Grounding conductors (Table 250.122)",
                nec: "NEC 250.122",
                body: (
                  <ul className="list-inside list-disc text-sm">
                    <li>15–20 A: 14 AWG Cu</li>
                    <li>30–60 A: 10 AWG Cu</li>
                    <li>100 A: 8 AWG Cu</li>
                    <li>200 A: 6 AWG Cu</li>
                    <li>300 A: 4 AWG Cu</li>
                    <li>400 A: 3 AWG Cu</li>
                    <li>500 A: 2 AWG Cu</li>
                    <li>600 A: 1 AWG Cu</li>
                    <li>800 A: 1/0 AWG Cu</li>
                    <li>1000 A: 2/0 AWG Cu</li>
                    <li>1200 A: 3/0 AWG Cu</li>
                  </ul>
                ),
              },
              {
                key: "c7",
                title: "Box fill (NEC 314.16)",
                nec: "NEC 314.16",
                body: (
                  <ul className="list-inside list-disc text-sm">
                    <li>#14 = 2.00 in³ per conductor</li>
                    <li>#12 = 2.25 in³</li>
                    <li>#10 = 2.50 in³</li>
                    <li>#8 = 3.00 in³</li>
                    <li>#6 = 5.00 in³</li>
                    <li>
                      Count: each conductor + devices ×2 + largest ground + all
                      grounds as one + clamps allowance
                    </li>
                  </ul>
                ),
              },
            ] as const
          ).map((card) => (
            <div
              key={card.key}
              className="tool-surface-card overflow-hidden"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                <button
                  type="button"
                  className="text-left font-semibold"
                  onClick={() => toggleCard(card.key)}
                >
                  {openCards[card.key] ? "▼" : "▶"} {card.title}
                </button>
                <button
                  type="button"
                  className="rounded border border-[#E8C84A]/50 px-2 py-1 text-xs font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/10"
                  onClick={() =>
                    printRefCard(`eref-${card.key}`, card.title, card.nec)
                  }
                >
                  Print
                </button>
              </div>
              {openCards[card.key] ? (
                <div id={`eref-${card.key}`} className="px-4 py-3">
                  {card.body}
                </div>
              ) : (
                <div id={`eref-${card.key}`} className="hidden" aria-hidden>
                  {card.body}
                </div>
              )}
            </div>
          ))}
        </section>

        <p className="tool-muted pb-8 text-center text-xs">
          <Link href="/tools/motor-hvac-calculator" className="text-[#E8C84A] hover:underline">
            Motor & HVAC calculator
          </Link>
          {" · "}
          <Link href="/dashboard" className="text-[#E8C84A] hover:underline">
            Dashboard
          </Link>
        </p>
      </main>
    </div>
  );
}
