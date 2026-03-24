"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ToolPageHeader } from "@/components/tool-page-header";
import { useThemedPageShell } from "@/lib/theme-context";
import {
  computeGeneratorSize,
  computeHvacCircuit,
  computeMotorCircuit,
  computeTransformer,
  FLA_1PH,
  FLA_3PH,
} from "@/lib/motor-hvac-engine";

const HP_KEYS = [
  "1/6",
  "1/4",
  "1/3",
  "1/2",
  "3/4",
  "1",
  "1.5",
  "2",
  "3",
  "5",
  "7.5",
  "10",
  "15",
  "20",
  "25",
  "30",
  "40",
  "50",
  "60",
  "75",
  "100",
  "125",
  "150",
  "200",
] as const;

const MOTOR_VOLTAGES = [
  115, 120, 208, 230, 240, 460, 480, 575,
] as const;

function printSection(title: string, elementId: string, nec: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title><style>
    body{font-family:system-ui;padding:24px;color:#111;}
    .brand{color:#a88416;font-weight:700;} h1{font-size:18px;}
    table{border-collapse:collapse;width:100%;font-size:11px;} th,td{border:1px solid #ccc;padding:4px;}
    footer{font-size:10px;margin-top:20px;color:#555;}
  </style></head><body>
  <p class="brand">TPP Electric</p><h1>${title}</h1>
  ${el.innerHTML}
  <footer>${nec} · ${new Date().toLocaleString()}</footer>
  </body></html>`);
  w.document.close();
  w.print();
  w.close();
}

type CalcTab = "motor" | "hvac" | "xf" | "gen";

export function MotorHvacCalculatorClient() {
  const shell = useThemedPageShell();
  const [calcTab, setCalcTab] = useState<CalcTab>("motor");

  const [motorType, setMotorType] = useState<
    "sp_ac" | "tp_ac" | "dc" | "wound"
  >("sp_ac");
  const [hpKey, setHpKey] = useState<string>("5");
  const [mVolt, setMVolt] = useState<(typeof MOTOR_VOLTAGES)[number]>(230);
  const [mPhase, setMPhase] = useState<"single" | "three">("single");
  const [sf, setSf] = useState<1 | 1.15 | 1.25>(1.15);
  const [manualFla, setManualFla] = useState("");

  const motorRes = useMemo(() => {
    const nameplateOnly = motorType === "dc" || motorType === "wound";
    const override = nameplateOnly ? Number(manualFla) || null : null;
    return computeMotorCircuit({
      hpKey,
      voltage: mVolt as never,
      phase: mPhase,
      serviceFactor: sf,
      overrideFla: override,
      nameplateFlaOnly: nameplateOnly,
    });
  }, [motorType, hpKey, mVolt, mPhase, sf, manualFla]);

  const [hvacType, setHvacType] = useState("split_ac");
  const [rla, setRla] = useState(18);
  const [lra, setLra] = useState(85);
  const [fanFla, setFanFla] = useState(1.5);
  const [fanCount, setFanCount] = useState<1 | 2>(1);
  const [hvacV, setHvacV] = useState(240);
  const [hvacPhase, setHvacPhase] = useState<"single" | "three">("single");
  const [mcaPlate, setMcaPlate] = useState("");
  const [mocpPlate, setMocpPlate] = useState("");
  const [hvacFt, setHvacFt] = useState(50);

  const hvacRes = useMemo(
    () =>
      computeHvacCircuit({
        compressorRla: rla,
        fanFla,
        fanCount,
        distanceFt: hvacFt,
        voltage: hvacV,
        phase: hvacPhase,
      }),
    [rla, fanFla, fanCount, hvacFt, hvacV, hvacPhase],
  );

  const [priV, setPriV] = useState(480);
  const [secV, setSecV] = useState(120);
  const [tPhase, setTPhase] = useState<"single" | "three">("single");
  const [tAmps, setTAmps] = useState("");
  const [tWatts, setTWatts] = useState("");
  const [tKva, setTKva] = useState("");

  const xfRes = useMemo(
    () =>
      computeTransformer({
        primaryV: priV,
        secondaryV: secV,
        phase: tPhase,
        loadAmps: tAmps === "" ? null : Number(tAmps),
        loadWatts: tWatts === "" ? null : Number(tWatts),
        loadKva: tKva === "" ? null : Number(tKva),
      }),
    [priV, secV, tPhase, tAmps, tWatts, tKva],
  );

  const [genLoads, setGenLoads] = useState({
    lighting: { on: true, w: 1200 },
    fridge: { on: true, w: 800 },
    hvac: { on: false, w: 5000 },
    sump: { on: false, w: 1500 },
    medical: { on: false, w: 500 },
    security: { on: false, w: 200 },
    custom: { on: false, w: 1000 },
  });
  const [startFactor, setStartFactor] = useState(3);

  const genRes = useMemo(() => {
    let run = 0;
    for (const k of Object.keys(genLoads) as (keyof typeof genLoads)[]) {
      const x = genLoads[k];
      if (x.on) run += x.w;
    }
    return computeGeneratorSize({
      runningWatts: run,
      motorStartFactor: startFactor,
    });
  }, [genLoads, startFactor]);

  const nameplateFields = [
    {
      k: "HP",
      t: "Mechanical output — used with NEC FLA tables (430.248 / 430.250).",
    },
    { k: "RPM", t: "Speed — affects starter/reduce-voltage selection." },
    { k: "FLA", t: "Full-load amps — base for conductor & OCP sizing (430.22)." },
    { k: "LRA", t: "Locked rotor — affects starting current / gen sizing." },
    { k: "SF", t: "Service factor — overload device settings (430.32)." },
    { k: "NEMA frame", t: "Physical mount — coupling to disconnect / conduit." },
    { k: "Duty", t: "Continuous vs intermittent — affects 125% rules." },
    { k: "Insulation class", t: "Thermal rating — not a wire size by itself." },
    { k: "Code letter", t: "Locked-rotor kVA/HP — Table 430.7(B)." },
    { k: "Design letter", t: "Torque/slip characteristics." },
    { k: "Enclosure", t: "Wet/dust — raceway & disconnect environment." },
    { k: "Phase / V / Hz", t: "Must match supply and table used for FLA." },
  ];

  return (
    <div className={shell}>
      <ToolPageHeader
        title="Motor & HVAC Calculator"
        subtitle="NEC 430, 440 (ref.) — rule-based only"
      >
        <Link
          href="/tools/electrical-reference"
          className="rounded-lg border border-sky-500/45 bg-sky-950/30 px-3 py-2 text-sm font-medium text-sky-100 hover:bg-sky-950/45"
        >
          Electrical Reference
        </Link>
      </ToolPageHeader>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <p className="tool-muted text-sm">
          Use nameplate data where shown. DC / wound-rotor: enter nameplate FLA
          (NEC 430.6). Verify all OCPD with NEC and manufacturer data.
        </p>

        <div className="flex flex-wrap gap-2 border-b border-white/10 pb-4">
          {(
            [
              ["motor", "Motor Calculator"],
              ["hvac", "HVAC / AC Condenser"],
              ["xf", "Transformer"],
              ["gen", "Generator Sizing"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setCalcTab(id)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                calcTab === id
                  ? "bg-[#E8C84A] text-[#0a1628]"
                  : "border border-white/20 text-white/85 hover:bg-white/5"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {calcTab === "motor" ? (
        <section className="tool-surface-card space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Motor (NEC 430)</h2>
            <button
              type="button"
              className="text-xs font-semibold text-[#E8C84A] hover:underline"
              onClick={() =>
                printSection("Motor FLA tables", "motor-fla-tables", "430.248 / 430.250")
              }
            >
              Print tables
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="tool-muted block">Motor type</span>
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={motorType}
                onChange={(e) => {
                  const v = e.target.value as typeof motorType;
                  setMotorType(v);
                  if (v === "tp_ac") setMPhase("three");
                  if (v === "sp_ac") setMPhase("single");
                }}
              >
                <option value="sp_ac">Single-phase AC</option>
                <option value="tp_ac">Three-phase AC</option>
                <option value="dc">DC motor</option>
                <option value="wound">Wound rotor</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="tool-muted block">HP</span>
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={hpKey}
                onChange={(e) => setHpKey(e.target.value)}
              >
                {HP_KEYS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="tool-muted block">Voltage</span>
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={mVolt}
                onChange={(e) =>
                  setMVolt(Number(e.target.value) as (typeof MOTOR_VOLTAGES)[number])
                }
              >
                {MOTOR_VOLTAGES.map((v) => (
                  <option key={v} value={v}>
                    {v}V
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="tool-muted block">Phase (for AC tables)</span>
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={mPhase}
                onChange={(e) =>
                  setMPhase(e.target.value as "single" | "three")
                }
              >
                <option value="single">Single</option>
                <option value="three">Three</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="tool-muted block">Service factor</span>
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={sf}
                onChange={(e) => setSf(Number(e.target.value) as 1 | 1.15 | 1.25)}
              >
                <option value={1}>1.0</option>
                <option value={1.15}>1.15</option>
                <option value={1.25}>1.25</option>
              </select>
            </label>
          </div>
          {(motorType === "dc" || motorType === "wound") && (
            <label className="text-sm">
              <span className="tool-muted block">Nameplate FLA</span>
              <input
                className="tool-field mt-1 w-full px-2 py-2"
                value={manualFla}
                onChange={(e) => setManualFla(e.target.value)}
                placeholder="Required for DC / wound rotor"
              />
            </label>
          )}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm">
            {motorRes.fla <= 0 ? (
              <p className="text-amber-200">
                {motorType === "dc" || motorType === "wound"
                  ? "Enter nameplate FLA (NEC 430.6)."
                  : "No FLA in table for this HP/voltage/phase — adjust voltage/phase or use nameplate FLA (430.6)."}
              </p>
            ) : (
              <ul className="space-y-1">
                <li>Full-load amps: {motorRes.fla} A</li>
                <li>Minimum conductor (125% FLA): {motorRes.minConductorA} A → {motorRes.minAwg} THHN Cu (ref.)</li>
                <li>Max inverse-time breaker: {motorRes.maxBreaker} A (430.52)</li>
                <li>Max dual-element fuse: {motorRes.maxDualFuse} A</li>
                <li>Overload relay setpoint (ref.): {motorRes.overloadA} A</li>
                <li>Disconnect: {motorRes.disconnectHp} (430.110)</li>
                <li>Starter (illustrative NEMA): {motorRes.starterNema}</li>
                <li>Minimum conduit (illustrative): {motorRes.conduitTrade} EMT</li>
                <li className="text-xs opacity-80">{motorRes.necRefs.join(" · ")}</li>
              </ul>
            )}
          </div>
          <div id="motor-fla-tables" className="overflow-x-auto text-xs">
            <h3 className="tool-muted mb-2 font-semibold">430.248 Single-phase</h3>
            <table className="mb-4 w-full min-w-[360px] border-collapse">
              <thead>
                <tr className="border-b border-white/15">
                  <th className="p-1">HP</th>
                  <th className="p-1">115V</th>
                  <th className="p-1">208V</th>
                  <th className="p-1">230V</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(FLA_1PH).map(([hp, r]) => (
                  <tr key={hp} className="border-b border-white/10">
                    <td className="p-1">{hp}</td>
                    <td className="p-1">{r.v115}</td>
                    <td className="p-1">{r.v208}</td>
                    <td className="p-1">{r.v230}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 className="tool-muted mb-2 font-semibold">430.250 Three-phase</h3>
            <table className="w-full min-w-[400px] border-collapse">
              <thead>
                <tr className="border-b border-white/15">
                  <th className="p-1">HP</th>
                  <th className="p-1">208V</th>
                  <th className="p-1">230V</th>
                  <th className="p-1">460V</th>
                  <th className="p-1">575V</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(FLA_3PH).map(([hp, r]) => (
                  <tr key={hp} className="border-b border-white/10">
                    <td className="p-1">{hp}</td>
                    <td className="p-1">{r.v208}</td>
                    <td className="p-1">{r.v230}</td>
                    <td className="p-1">{r.v460}</td>
                    <td className="p-1">{r.v575}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        <div className="border-t border-white/10 pt-6">
          <h2 className="text-lg font-semibold">Motor nameplate decoder</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {nameplateFields.map((f) => (
              <li key={f.k} className="rounded-lg border border-white/10 p-2">
                <span className="font-semibold text-[#E8C84A]">{f.k}</span>
                <span className="tool-muted"> — {f.t}</span>
              </li>
            ))}
          </ul>
        </div>
        </section>
        ) : null}

        {calcTab === "hvac" ? (
        <section className="tool-surface-card space-y-4 p-6">
          <h2 className="text-lg font-semibold">HVAC / condenser (440)</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              <span className="tool-muted block">Unit type</span>
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={hvacType}
                onChange={(e) => setHvacType(e.target.value)}
              >
                <option value="split_ac">Split AC</option>
                <option value="hp">Heat pump</option>
                <option value="pkg">Package unit</option>
                <option value="mini">Mini split</option>
                <option value="chiller">Chiller</option>
                <option value="ah">Air handler</option>
              </select>
            </label>
            <label className="text-sm">
              Compressor RLA
              <input
                type="number"
                className="tool-field mt-1 w-full px-2 py-2"
                value={rla}
                onChange={(e) => setRla(Number(e.target.value))}
              />
            </label>
            <label className="text-sm">
              Compressor LRA (nameplate)
              <input
                type="number"
                className="tool-field mt-1 w-full px-2 py-2"
                value={lra}
                onChange={(e) => setLra(Number(e.target.value))}
              />
            </label>
            <label className="text-sm">
              Fan motor FLA
              <input
                type="number"
                step={0.1}
                className="tool-field mt-1 w-full px-2 py-2"
                value={fanFla}
                onChange={(e) => setFanFla(Number(e.target.value))}
              />
            </label>
            <label className="text-sm">
              Fan motors
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={fanCount}
                onChange={(e) => setFanCount(Number(e.target.value) as 1 | 2)}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </label>
            <label className="text-sm">
              Voltage
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={hvacV}
                onChange={(e) => setHvacV(Number(e.target.value))}
              >
                {[208, 230, 240, 460, 480].map((v) => (
                  <option key={v} value={v}>
                    {v}V
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Phase
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={hvacPhase}
                onChange={(e) =>
                  setHvacPhase(e.target.value as "single" | "three")
                }
              >
                <option value="single">Single</option>
                <option value="three">Three</option>
              </select>
            </label>
            <label className="text-sm">
              MCA (nameplate)
              <input
                className="tool-field mt-1 w-full px-2 py-2"
                value={mcaPlate}
                onChange={(e) => setMcaPlate(e.target.value)}
                placeholder="Optional"
              />
            </label>
            <label className="text-sm">
              MOCP (nameplate)
              <input
                className="tool-field mt-1 w-full px-2 py-2"
                value={mocpPlate}
                onChange={(e) => setMocpPlate(e.target.value)}
                placeholder="Optional"
              />
            </label>
            <label className="text-sm">
              Distance (ft)
              <input
                type="number"
                className="tool-field mt-1 w-full px-2 py-2"
                value={hvacFt}
                onChange={(e) => setHvacFt(Number(e.target.value))}
              />
            </label>
          </div>
          <div className="rounded-xl border border-sky-500/30 bg-sky-950/25 p-4 text-sm">
            <ul className="space-y-1">
              {mcaPlate ? (
                <li>Nameplate MCA (entered): {mcaPlate} A</li>
              ) : null}
              <li>Calculated MCA (RLA×1.25 + fans): {hvacRes.mca} A</li>
              <li>Calculated MOCP basis (RLA×2.25 + fans): {hvacRes.mocp} A</li>
              <li>Maximum breaker (next standard up): {hvacRes.breaker} A</li>
              <li>Minimum wire: {hvacRes.minWire}</li>
              <li>Minimum conduit: {hvacRes.conduit}</li>
              <li>Disconnect: {hvacRes.disconnect} A non-fused (verify nameplate)</li>
              <li>Voltage drop check (VD calc): {hvacRes.vdPctApprox}%</li>
              <li className="text-xs">NEC 440.32, 440.33; 210.19 VD guidance</li>
            </ul>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 text-xs">
            <div>
              <h3 className="font-semibold text-[#E8C84A]">HVAC cheat</h3>
              <table className="mt-2 w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/15">
                    <th className="p-1 text-left">Tons</th>
                    <th className="p-1">MCA</th>
                    <th className="p-1">Wire</th>
                    <th className="p-1">Brk</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["1.5", "12–16A", "12", "20"],
                    ["2", "15–20A", "12", "25"],
                    ["2.5", "18–24A", "10", "30"],
                    ["3", "20–28A", "10", "35"],
                    ["3.5", "24–32A", "10", "40"],
                    ["4", "28–36A", "8", "45"],
                    ["5", "32–44A", "8", "60"],
                  ].map((r) => (
                    <tr key={r[0]} className="border-b border-white/10">
                      <td className="p-1">{r[0]}</td>
                      <td className="p-1">{r[1]}</td>
                      <td className="p-1">{r[2]} AWG</td>
                      <td className="p-1">{r[3]}A</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="font-semibold text-[#E8C84A]">Mini split (typical)</h3>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>9000 BTU: 15 A / 14 AWG</li>
                <li>12000 BTU: 20 A / 12 AWG</li>
                <li>18000 BTU: 20 A / 12 AWG</li>
                <li>24000 BTU: 25 A / 10 AWG</li>
                <li>36000 BTU: 30 A / 10 AWG</li>
              </ul>
            </div>
          </div>
        </section>
        ) : null}

        {calcTab === "xf" ? (
        <section className="tool-surface-card space-y-4 p-6">
          <h2 className="text-lg font-semibold">Transformer</h2>
          <p className="tool-muted text-xs">NEC 450 — enter one load value</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Primary V
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={priV}
                onChange={(e) => setPriV(Number(e.target.value))}
              >
                {[480, 240, 208, 120].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Secondary V
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={secV}
                onChange={(e) => setSecV(Number(e.target.value))}
              >
                {[480, 240, 208, 120, 24, 12].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Phase
              <select
                className="tool-field mt-1 w-full px-2 py-2"
                value={tPhase}
                onChange={(e) =>
                  setTPhase(e.target.value as "single" | "three")
                }
              >
                <option value="single">Single</option>
                <option value="three">Three</option>
              </select>
            </label>
            <label className="text-sm">
              Load amps (secondary)
              <input
                className="tool-field mt-1 w-full px-2 py-2"
                value={tAmps}
                onChange={(e) => setTAmps(e.target.value)}
                placeholder="A"
              />
            </label>
            <label className="text-sm">
              Load watts
              <input
                className="tool-field mt-1 w-full px-2 py-2"
                value={tWatts}
                onChange={(e) => setTWatts(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Load kVA
              <input
                className="tool-field mt-1 w-full px-2 py-2"
                value={tKva}
                onChange={(e) => setTKva(e.target.value)}
              />
            </label>
          </div>
          <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 p-4 text-sm">
            <ul className="space-y-1">
              <li>Calculated kVA: {xfRes.kva}</li>
              <li>Next standard kVA: {xfRes.kvaRated}</li>
              <li>Primary A: {xfRes.primaryA}</li>
              <li>Secondary A: {xfRes.secondaryA}</li>
              <li>Primary conductor (ref. Cu): {xfRes.priWire}</li>
              <li>Secondary conductor (ref. Cu): {xfRes.secWire}</li>
              <li className="text-xs">{xfRes.necRefs.join(" · ")} — size OCP per 450.3</li>
            </ul>
          </div>
        </section>
        ) : null}

        {calcTab === "gen" ? (
        <section className="tool-surface-card space-y-4 p-6">
          <h2 className="text-lg font-semibold">Generator sizing</h2>
          <p className="tool-muted text-xs">
            Running total + motor-start multiplier (illustrative). NEC 702.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(genLoads) as (keyof typeof genLoads)[]).map((k) => (
              <label
                key={k}
                className="flex flex-wrap items-center gap-2 rounded border border-white/10 p-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={genLoads[k].on}
                  onChange={(e) =>
                    setGenLoads((p) => ({
                      ...p,
                      [k]: { ...p[k], on: e.target.checked },
                    }))
                  }
                />
                {k}
                <input
                  type="number"
                  className="tool-field w-24 px-2 py-1"
                  value={genLoads[k].w}
                  onChange={(e) =>
                    setGenLoads((p) => ({
                      ...p,
                      [k]: { ...p[k], w: Number(e.target.value) },
                    }))
                  }
                />
                W
              </label>
            ))}
          </div>
          <label className="text-sm">
            Starting factor (motor loads)
            <select
              className="tool-field ml-2 px-2 py-1"
              value={startFactor}
              onChange={(e) => setStartFactor(Number(e.target.value))}
            >
              <option value={2}>2×</option>
              <option value={3}>3×</option>
              <option value={4}>4×</option>
            </select>
          </label>
          <div className="rounded-xl border border-violet-500/30 bg-violet-950/25 p-4 text-sm">
            <ul>
              <li>Running load: {genRes.runningKw} kW</li>
              <li>Starting load (×{startFactor}): {genRes.startingKw} kW</li>
              <li>Recommended gen: {genRes.recommendedKw} kW</li>
              <li>Standard size up: {genRes.standardKw} kW</li>
              <li>Transfer switch: match service / calculated load — NEC 702.7</li>
            </ul>
          </div>
        </section>
        ) : null}
      </main>
    </div>
  );
}
