"use client";

import { useCallback, useMemo, useState } from "react";
import { useTheme } from "@/lib/theme-context";

type Tab = "ohm" | "power" | "units";

function num(v: string): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function FloatingCalculatorWidget() {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [tab, setTab] = useState<Tab>("ohm");

  const panelBg =
    theme === "light"
      ? "border-slate-300 bg-white text-slate-900 shadow-xl"
      : "border-[#E8C84A]/35 bg-[#071422] text-white shadow-2xl shadow-black/50";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setMinimized(false);
        }}
        className="fixed bottom-5 right-5 z-[100] flex items-center gap-2 rounded-full border-2 border-[#E8C84A]/60 bg-[#0d2847] px-4 py-3 text-sm font-bold text-[#E8C84A] shadow-lg hover:bg-[#123a5c]"
        aria-label="Open calculator"
      >
        ⚡ Calc
      </button>

      {open && !minimized ? (
        <div
          className={`fixed bottom-5 right-5 z-[101] flex w-[min(100vw-2rem,22rem)] flex-col rounded-xl border ${panelBg}`}
        >
          <div className="flex items-center justify-between border-b border-[#E8C84A]/25 px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-wide text-[#E8C84A]">
              Quick calc
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setMinimized(true)}
                className="rounded px-2 py-0.5 text-xs opacity-70 hover:opacity-100"
              >
                —
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-2 py-0.5 text-xs opacity-70 hover:opacity-100"
              >
                ×
              </button>
            </div>
          </div>
          <div className="flex border-b border-white/10">
            {(
              [
                ["ohm", "Ohm"],
                ["power", "Power"],
                ["units", "Units"],
              ] as const
            ).map(([id, lab]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex-1 py-2 text-xs font-semibold ${
                  tab === id
                    ? "bg-[#E8C84A]/20 text-[#E8C84A]"
                    : "text-white/60 hover:bg-white/5"
                }`}
              >
                {lab}
              </button>
            ))}
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-3 text-sm">
            {tab === "ohm" ? <OhmLawPanel theme={theme} /> : null}
            {tab === "power" ? <PowerPanel theme={theme} /> : null}
            {tab === "units" ? <UnitsPanel theme={theme} /> : null}
          </div>
        </div>
      ) : null}

      {open && minimized ? (
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="fixed bottom-5 right-28 z-[101] rounded-full border border-[#E8C84A]/50 bg-[#0a1628] px-3 py-2 text-xs text-[#E8C84A]"
        >
          Calc ▲
        </button>
      ) : null}
    </>
  );
}

function inpCls(theme: "dark" | "light") {
  return theme === "light"
    ? "mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
    : "mt-0.5 w-full rounded border border-white/20 bg-[#0a1628] px-2 py-1 text-white";
}

function OhmLawPanel({ theme }: { theme: "dark" | "light" }) {
  const [v, setV] = useState("");
  const [i, setI] = useState("");
  const [r, setR] = useState("");
  const [p, setP] = useState("");

  const solve = useCallback(() => {
    const V = num(v);
    const I = num(i);
    const R = num(r);
    const Pw = num(p);
    const known = [V, I, R, Pw].filter((x) => x != null).length;
    if (known < 2) return;

    let vv = V,
      ii = I,
      rr = R,
      pp = Pw;
    if (vv != null && ii != null) {
      rr = vv / ii;
      pp = vv * ii;
    } else if (vv != null && rr != null && rr !== 0) {
      ii = vv / rr;
      pp = vv * ii;
    } else if (ii != null && rr != null) {
      vv = ii * rr;
      pp = vv * ii;
    } else if (vv != null && pp != null && vv !== 0) {
      ii = pp / vv;
      rr = vv / ii;
    } else if (ii != null && pp != null && ii !== 0) {
      vv = pp / ii;
      rr = vv / ii;
    } else if (rr != null && pp != null && rr !== 0) {
      ii = Math.sqrt(pp / rr);
      vv = ii * rr;
    }
    if (vv != null) setV(String(Math.round(vv * 1000) / 1000));
    if (ii != null) setI(String(Math.round(ii * 1000) / 1000));
    if (rr != null) setR(String(Math.round(rr * 1000) / 1000));
    if (pp != null) setP(String(Math.round(pp * 1000) / 1000));
  }, [v, i, r, p]);

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-white/50">
        Enter any 2 values. V=IR, P=IV, P=V²/R, P=I²R
      </p>
      <label className="block text-xs">
        V (volts)
        <input className={inpCls(theme)} value={v} onChange={(e) => setV(e.target.value)} />
      </label>
      <label className="block text-xs">
        I (amps)
        <input className={inpCls(theme)} value={i} onChange={(e) => setI(e.target.value)} />
      </label>
      <label className="block text-xs">
        R (ohms)
        <input className={inpCls(theme)} value={r} onChange={(e) => setR(e.target.value)} />
      </label>
      <label className="block text-xs">
        P (watts)
        <input className={inpCls(theme)} value={p} onChange={(e) => setP(e.target.value)} />
      </label>
      <button
        type="button"
        onClick={solve}
        className="w-full rounded bg-[#E8C84A] py-2 text-xs font-bold text-[#0a1628]"
      >
        Solve
      </button>
    </div>
  );
}

function PowerPanel({ theme }: { theme: "dark" | "light" }) {
  const [volts, setVolts] = useState("240");
  const [kw, setKw] = useState("");
  const [amps, setAmps] = useState("");
  const [hp, setHp] = useState("");
  const [watts, setWatts] = useState("");
  const [kva, setKva] = useState("");
  const [pfKw, setPfKw] = useState("");
  const [pfKva, setPfKva] = useState("");

  const kwToA = useMemo(() => {
    const k = num(kw);
    const v = num(volts);
    if (k == null || v == null || v === 0) return "—";
    return `${Math.round((k * 1000) / v * 100) / 100} A`;
  }, [kw, volts]);

  const aToKw = useMemo(() => {
    const a = num(amps);
    const v = num(volts);
    if (a == null || v == null) return "—";
    return `${Math.round((a * v) / 1000 * 1000) / 1000} kW`;
  }, [amps, volts]);

  const hpW = useMemo(() => {
    const h = num(hp);
    if (h == null) return "—";
    return `${Math.round(h * 746)} W`;
  }, [hp]);

  const wHp = useMemo(() => {
    const w = num(watts);
    if (w == null) return "—";
    return `${Math.round((w / 746) * 1000) / 1000} HP`;
  }, [watts]);

  const kvaVal = useMemo(() => {
    const v = num(volts);
    const a = num(amps);
    if (v == null || a == null) return "—";
    return `${Math.round((v * a) / 1000 * 1000) / 1000} kVA`;
  }, [volts, amps]);

  const pf = useMemo(() => {
    const k = num(pfKw);
    const kv = num(pfKva);
    if (k == null || kv == null || kv === 0) return "—";
    return `${Math.round((k / kv) * 1000) / 1000}`;
  }, [pfKw, pfKva]);

  return (
    <div className="space-y-3 text-xs">
      <label>
        Volts (for conversions)
        <input className={inpCls(theme)} value={volts} onChange={(e) => setVolts(e.target.value)} />
      </label>
      <div className="rounded border border-white/10 p-2">
        <div className="flex gap-2">
          <input className={inpCls(theme)} placeholder="kW" value={kw} onChange={(e) => setKw(e.target.value)} />
          <span className="self-center">→ {kwToA}</span>
        </div>
        <div className="mt-2 flex gap-2">
          <input className={inpCls(theme)} placeholder="A" value={amps} onChange={(e) => setAmps(e.target.value)} />
          <span className="self-center">→ {aToKw} kW</span>
        </div>
      </div>
      <div className="flex gap-2">
        <input className={inpCls(theme)} placeholder="HP" value={hp} onChange={(e) => setHp(e.target.value)} />
        <span className="self-center">{hpW}</span>
      </div>
      <div className="flex gap-2">
        <input className={inpCls(theme)} placeholder="W" value={watts} onChange={(e) => setWatts(e.target.value)} />
        <span className="self-center">{wHp} HP</span>
      </div>
      <div className="text-white/60">kVA = (V×I)/1000 → {kvaVal}</div>
      <div className="flex flex-wrap gap-2">
        <input className={inpCls(theme) + " w-20"} placeholder="kW" value={pfKw} onChange={(e) => setPfKw(e.target.value)} />
        <input className={inpCls(theme) + " w-20"} placeholder="kVA" value={pfKva} onChange={(e) => setPfKva(e.target.value)} />
        <span className="self-center">PF = {pf}</span>
      </div>
    </div>
  );
}

function UnitsPanel({ theme }: { theme: "dark" | "light" }) {
  const [w, setW] = useState("");
  const [a, setA] = useState("");
  const [ft, setFt] = useState("");
  const [btu, setBtu] = useState("");
  const [vLn, setVLn] = useState("120");

  const wKw = num(w);
  const kwFromW = wKw != null ? `${wKw / 1000} kW` : "—";
  const aMa = num(a);
  const maFromA = aMa != null ? `${aMa * 1000} mA` : "—";
  const f = num(ft);
  const mFromFt = f != null ? `${Math.round(f * 0.3048 * 1000) / 1000} m` : "—";
  const b = num(btu);
  const wFromBtu = b != null ? `${Math.round(b * 0.293071)} W` : "—";
  const vl = num(vLn);
  const vll = vl != null ? `${Math.round(vl * Math.sqrt(3) * 100) / 100} V (line-line est.)` : "—";

  return (
    <div className="space-y-3 text-xs">
      <div className="flex gap-2">
        <input className={inpCls(theme)} placeholder="Watts" value={w} onChange={(e) => setW(e.target.value)} />
        <span className="self-center">{kwFromW}</span>
      </div>
      <div className="flex gap-2">
        <input className={inpCls(theme)} placeholder="Amps" value={a} onChange={(e) => setA(e.target.value)} />
        <span className="self-center">{maFromA}</span>
      </div>
      <label>
        Line-to-neutral V (→ line-line 3φ)
        <input className={inpCls(theme)} value={vLn} onChange={(e) => setVLn(e.target.value)} />
        <span className="mt-1 block text-white/55">{vll}</span>
      </label>
      <div className="flex gap-2">
        <input className={inpCls(theme)} placeholder="Feet" value={ft} onChange={(e) => setFt(e.target.value)} />
        <span className="self-center">{mFromFt}</span>
      </div>
      <div className="flex gap-2">
        <input className={inpCls(theme)} placeholder="BTU/hr" value={btu} onChange={(e) => setBtu(e.target.value)} />
        <span className="self-center">{wFromBtu}</span>
      </div>
    </div>
  );
}
