"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/lib/theme-context";

type Tab = "calc" | "sci" | "ohm" | "power" | "units";

type CalcOp = "+" | "-" | "×" | "÷";

function calculate(a: number, b: number, op: CalcOp): number {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      return b === 0 ? NaN : a / b;
    default:
      return b;
  }
}

function fmtDisplay(n: number): string {
  if (!Number.isFinite(n)) return "Error";
  const r = Math.round(n * 1e12) / 1e12;
  let s = String(r);
  if (s.length > 14) s = n.toPrecision(10);
  return s;
}

function factorialInt(n: number): number {
  if (!Number.isInteger(n) || n < 0) return NaN;
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** Scientific tab: gold keys, white numbers, navy utilities — matches widget theme. */
const FLOATING_CALC_PANEL_ID = "floating-calc-panel";

function ScientificCalculatorPanel({ theme }: { theme: "dark" | "light" }) {
  const [angleMode, setAngleMode] = useState<"deg" | "rad">("deg");
  const [memory, setMemory] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const [display, setDisplay] = useState("0");
  const [acc, setAcc] = useState<number | null>(null);
  const [pendingOp, setPendingOp] = useState<CalcOp | null>(null);
  const [waiting, setWaiting] = useState(false);

  /** Human-readable expression above the entry (e.g. "12 + 3 × "). */
  const [expressionDisplay, setExpressionDisplay] = useState("");
  /** EE: mantissa before E, then exponent digits */
  const [eeMode, setEeMode] = useState(false);
  const [eeMantissa, setEeMantissa] = useState<string | null>(null);
  const [eeExpStr, setEeExpStr] = useState("");
  /** xⁿ or ⁿ√x two-step */
  const [powPending, setPowPending] = useState<number | null>(null);
  const [rootPending, setRootPending] = useState<number | null>(null);

  const numClass =
    theme === "light"
      ? "rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 min-h-[40px]"
      : "rounded-lg border border-white/20 bg-white py-2.5 text-sm font-semibold text-[#0a1628] shadow-sm hover:bg-white/90 min-h-[40px]";
  const sciClass =
    theme === "light"
      ? "rounded-lg border border-amber-600/50 bg-amber-100 py-2 text-[11px] font-bold text-amber-950 shadow-sm hover:bg-amber-200 min-h-[40px] px-0.5 leading-tight"
      : "rounded-lg border border-[#E8C84A]/60 bg-[#E8C84A]/20 py-2 text-[11px] font-bold text-[#E8C84A] shadow-sm hover:bg-[#E8C84A]/30 min-h-[40px] px-0.5 leading-tight";
  const utilClass =
    theme === "light"
      ? "rounded-lg border border-slate-300 bg-slate-100 py-2 text-[11px] font-semibold text-slate-800 hover:bg-slate-200 min-h-[40px]"
      : "rounded-lg border border-white/25 bg-[#0a1628] py-2 text-[11px] font-semibold text-white/90 hover:bg-white/10 min-h-[40px]";
  const opClass =
    "rounded-lg border border-[#E8C84A]/70 bg-[#E8C84A] py-2.5 text-sm font-bold text-[#0a1628] shadow-sm hover:bg-[#f0d56e] min-h-[40px]";

  const screenExpr =
    theme === "light"
      ? "border border-slate-200 bg-slate-50 text-slate-800"
      : "border border-white/15 bg-[#050d18] text-white/85";
  const screenResult =
    theme === "light"
      ? "border border-slate-200 bg-white text-slate-900"
      : "border border-white/15 bg-[#071a2e] text-white";

  const toRad = (v: number) =>
    angleMode === "deg" ? (v * Math.PI) / 180 : v;
  const fromRad = (v: number) =>
    angleMode === "deg" ? (v * 180) / Math.PI : v;

  const getN = (): number => {
    if (display === "Error") return NaN;
    if (eeMode && eeMantissa != null) {
      const exp =
        eeExpStr === "" || eeExpStr === "-"
          ? 0
          : parseInt(eeExpStr, 10);
      const m = parseFloat(eeMantissa);
      if (Number.isNaN(m) || Number.isNaN(exp)) return NaN;
      return m * Math.pow(10, exp);
    }
    return parseFloat(display);
  };

  const pushHistory = (line: string) => {
    setHistory((h) => [line, ...h].slice(0, 5));
  };

  const resetEE = () => {
    setEeMode(false);
    setEeMantissa(null);
    setEeExpStr("");
  };

  const setDisplayFromNumber = (n: number) => {
    resetEE();
    setDisplay(fmtDisplay(n));
  };

  const inputDigit = (d: string) => {
    if (eeMode) {
      if (eeMantissa == null || d === ".") return;
      if (d === "-" && eeExpStr === "") {
        setEeExpStr("-");
        setDisplay(`${eeMantissa}E-`);
        return;
      }
      if (!/\d/.test(d)) return;
      const next = eeExpStr === "-" ? `-${d}` : eeExpStr + d;
      if (!/^-?\d+$/.test(next)) return;
      setEeExpStr(next);
      const exp = parseInt(next, 10);
      const m = parseFloat(eeMantissa);
      if (!Number.isNaN(m) && !Number.isNaN(exp)) {
        setDisplay(fmtDisplay(m * Math.pow(10, exp)));
      }
      return;
    }
    if (waiting) {
      setDisplay(d === "." ? "0." : d);
      setWaiting(false);
    } else {
      if (d === ".") {
        if (display.includes(".")) return;
        setDisplay(display + ".");
      } else if (display === "0" && d !== ".") {
        setDisplay(d);
      } else {
        setDisplay(display + d);
      }
    }
  };

  const inputOp = (next: CalcOp, sym: string) => {
    resetEE();
    const n = getN();
    if (Number.isNaN(n)) return;
    if (powPending != null) {
      const base = powPending;
      const r = Math.pow(base, n);
      pushHistory(`${fmtDisplay(base)}^${fmtDisplay(n)} = ${fmtDisplay(r)}`);
      setPowPending(null);
      setDisplayFromNumber(r);
      setAcc(null);
      setPendingOp(null);
      setExpressionDisplay("");
      setWaiting(true);
      return;
    }
    if (rootPending != null) {
      if (n === 0) {
        setDisplay("Error");
        setRootPending(null);
        return;
      }
      const rad = rootPending;
      const r = Math.pow(rad, 1 / n);
      pushHistory(`${fmtDisplay(n)}√(${fmtDisplay(rad)}) = ${fmtDisplay(r)}`);
      setRootPending(null);
      setDisplayFromNumber(r);
      setAcc(null);
      setPendingOp(null);
      setExpressionDisplay("");
      setWaiting(true);
      return;
    }

    if (acc != null && pendingOp != null && !waiting) {
      const r = calculate(acc, n, pendingOp);
      if (!Number.isFinite(r)) {
        setDisplay("Error");
        setAcc(null);
        setPendingOp(null);
        setExpressionDisplay("");
        return;
      }
      setAcc(r);
      setDisplay(fmtDisplay(r));
      setExpressionDisplay((e) => e + fmtDisplay(n) + ` ${sym} `);
    } else {
      setAcc(n);
      setExpressionDisplay(`${fmtDisplay(n)} ${sym} `);
    }
    setPendingOp(next);
    setWaiting(true);
  };

  const equals = () => {
    resetEE();
    const n = getN();
    if (Number.isNaN(n)) return;
    if (powPending != null) {
      const base = powPending;
      const r = Math.pow(base, n);
      pushHistory(`${fmtDisplay(base)}^${fmtDisplay(n)} = ${fmtDisplay(r)}`);
      setPowPending(null);
      setDisplayFromNumber(r);
      setAcc(null);
      setPendingOp(null);
      setExpressionDisplay("");
      setWaiting(true);
      return;
    }
    if (rootPending != null) {
      if (n === 0) {
        setDisplay("Error");
        setRootPending(null);
        return;
      }
      const rad = rootPending;
      const r = Math.pow(rad, 1 / n);
      pushHistory(`${fmtDisplay(n)}√(${fmtDisplay(rad)}) = ${fmtDisplay(r)}`);
      setRootPending(null);
      setDisplayFromNumber(r);
      setAcc(null);
      setPendingOp(null);
      setExpressionDisplay("");
      setWaiting(true);
      return;
    }
    if (pendingOp == null || acc == null) return;
    const r = calculate(acc, n, pendingOp);
    const sym =
      pendingOp === "+"
        ? "+"
        : pendingOp === "-"
          ? "−"
          : pendingOp === "×"
            ? "×"
            : "÷";
    pushHistory(
      `${expressionDisplay}${fmtDisplay(n)} = ${fmtDisplay(r)}`.replace(
        /\s+/g,
        " ",
      ),
    );
    setDisplayFromNumber(r);
    setAcc(null);
    setPendingOp(null);
    setExpressionDisplay("");
    setWaiting(true);
  };

  const clearAll = () => {
    resetEE();
    setDisplay("0");
    setAcc(null);
    setPendingOp(null);
    setWaiting(false);
    setExpressionDisplay("");
    setPowPending(null);
    setRootPending(null);
  };

  const backspace = () => {
    if (eeMode && eeMantissa != null) {
      if (eeExpStr.length > 0) {
        setEeExpStr((s) => s.slice(0, -1));
        return;
      }
      resetEE();
      return;
    }
    if (waiting) return;
    if (display.length <= 1) setDisplay("0");
    else setDisplay(display.slice(0, -1));
  };

  const applyUnary = (fn: (x: number) => number, label: string) => {
    resetEE();
    const n = getN();
    if (Number.isNaN(n)) return;
    const r = fn(n);
    const argDeg =
      angleMode === "deg" &&
      (label === "sin" || label === "cos" || label === "tan")
        ? "°"
        : "";
    pushHistory(`${label}(${fmtDisplay(n)}${argDeg}) = ${fmtDisplay(r)}`);
    setDisplayFromNumber(r);
    setWaiting(true);
    setAcc(null);
    setPendingOp(null);
    setExpressionDisplay("");
  };

  const insertConst = (v: number) => {
    resetEE();
    setDisplay(fmtDisplay(v));
    setWaiting(false);
  };

  const percent = () => {
    resetEE();
    const n = getN();
    if (Number.isNaN(n)) return;
    setDisplayFromNumber(n / 100);
  };

  const toggleSign = () => {
    resetEE();
    const n = getN();
    if (Number.isNaN(n)) return;
    setDisplayFromNumber(-n);
  };

  const openParen = () => {
    resetEE();
    setExpressionDisplay((e) => e + "(");
  };
  const closeParen = () => {
    resetEE();
    setExpressionDisplay((e) => e + ")");
  };

  const pressEE = () => {
    const n = getN();
    if (Number.isNaN(n)) return;
    setEeMantissa(String(n));
    setEeExpStr("");
    setEeMode(true);
    setDisplay(`${fmtDisplay(n)}E`);
  };

  const memStore = () => {
    const n = getN();
    if (!Number.isNaN(n)) setMemory(n);
  };
  const memRecall = () => {
    resetEE();
    setDisplay(fmtDisplay(memory));
    setWaiting(true);
  };
  const memAdd = () => {
    const n = getN();
    if (!Number.isNaN(n)) setMemory((m) => m + n);
  };
  const memSub = () => {
    const n = getN();
    if (!Number.isNaN(n)) setMemory((m) => m - n);
  };
  const memClear = () => setMemory(0);

  const copyResult = async () => {
    const v = getN();
    const t =
      display === "Error"
        ? "Error"
        : Number.isFinite(v)
          ? fmtDisplay(v)
          : display;
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      /* ignore */
    }
  };

  const eeHint =
    eeMode && eeMantissa != null
      ? ` [EE: ${eeMantissa}×10^${eeExpStr === "" || eeExpStr === "-" ? "…" : eeExpStr}]`
      : "";
  const exprLine =
    expressionDisplay +
    (!waiting && display !== "Error" ? display : "") +
    eeHint +
    (powPending != null ? `  (${fmtDisplay(powPending)}^□)` : "") +
    (rootPending != null ? `  (${fmtDisplay(rootPending)}^(1/□))` : "");

  return (
    <div className="space-y-2">
      <p
        className={
          theme === "light"
            ? "text-[10px] text-slate-600"
            : "text-[10px] text-white/50"
        }
      >
        PF, 3φ V, Z, f₀ — sin/cos, √, xⁿ, log/ln; Deg/Rad for trig. ( ) add text on
        the top line for notes; + − × ÷ and = evaluate the number in the result row.
      </p>
      <div
        className={`min-h-[2.25rem] rounded-lg px-2 py-1.5 text-left text-[11px] leading-snug break-all ${screenExpr}`}
        title="Expression"
      >
        {exprLine.trim() || " "}
      </div>
      <div
        className={`min-h-[2.75rem] rounded-lg px-3 py-2 text-right text-xl font-semibold tabular-nums tracking-tight ${screenResult}`}
      >
        {display}
      </div>
      {history.length > 0 ? (
        <div
          className={`max-h-[4.5rem] overflow-y-auto rounded border px-2 py-1 text-[10px] tabular-nums ${
            theme === "light"
              ? "border-slate-200 bg-slate-50 text-slate-600"
              : "border-white/10 bg-black/20 text-white/55"
          }`}
        >
          {history.map((h, i) => (
            <div key={i} className="truncate" title={h}>
              {h}
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={utilClass} onClick={copyResult}>
          Copy
        </button>
        <button
          type="button"
          className={sciClass}
          onClick={() =>
            setAngleMode((m) => (m === "deg" ? "rad" : "deg"))
          }
        >
          {angleMode === "deg" ? "Deg" : "Rad"}
        </button>
      </div>
      <p
        className={
          theme === "light" ? "text-[10px] text-slate-500" : "text-[10px] text-white/40"
        }
      >
        M: {memory !== 0 ? fmtDisplay(memory) : "0"}
      </p>

      <div className="max-h-[14rem] overflow-y-auto pr-0.5">
        <div className="grid grid-cols-5 gap-1">
          <button type="button" className={utilClass} onClick={memClear}>
            MC
          </button>
          <button type="button" className={utilClass} onClick={memRecall}>
            MR
          </button>
          <button type="button" className={utilClass} onClick={memSub}>
            M−
          </button>
          <button type="button" className={utilClass} onClick={memAdd}>
            M+
          </button>
          <button type="button" className={utilClass} onClick={memStore}>
            MS
          </button>

          <button type="button" className={sciClass} onClick={openParen}>
            (
          </button>
          <button type="button" className={sciClass} onClick={closeParen}>
            )
          </button>
          <button type="button" className={sciClass} onClick={pressEE}>
            EE
          </button>
          <button type="button" className={sciClass} onClick={() => applyUnary((x) => Math.abs(x), "abs")}>
            |x|
          </button>
          <button
            type="button"
            className={sciClass}
            onClick={() => applyUnary((x) => factorialInt(x), "n!")}
          >
            n!
          </button>

          <button
            type="button"
            className={sciClass}
            onClick={() => applyUnary((x) => (x === 0 ? NaN : 1 / x), "1/x")}
          >
            1/x
          </button>
          <button type="button" className={sciClass} onClick={() => applyUnary((x) => x * x, "x²")}>
            x²
          </button>
          <button type="button" className={sciClass} onClick={() => applyUnary((x) => x * x * x, "x³")}>
            x³
          </button>
          <button
            type="button"
            className={sciClass}
            onClick={() => {
              resetEE();
              const b = getN();
              if (!Number.isNaN(b)) {
                setPowPending(b);
                setDisplay("0");
                setWaiting(true);
              }
            }}
          >
            xⁿ
          </button>
          <button
            type="button"
            className={sciClass}
            onClick={() => applyUnary((x) => (x < 0 ? NaN : Math.sqrt(x)), "√")}
          >
            √x
          </button>

          <button
            type="button"
            className={sciClass}
            onClick={() => applyUnary((x) => (x < 0 ? NaN : Math.cbrt(x)), "∛")}
          >
            ∛x
          </button>
          <button
            type="button"
            className={sciClass}
            onClick={() => {
              resetEE();
              const x = getN();
              if (!Number.isNaN(x)) {
                setRootPending(x);
                setDisplay("0");
                setWaiting(true);
              }
            }}
          >
            ⁿ√x
          </button>
          <button
            type="button"
            className={sciClass}
            onClick={() => applyUnary((x) => Math.log10(x), "log")}
          >
            log
          </button>
          <button
            type="button"
            className={sciClass}
            onClick={() => applyUnary((x) => Math.log(x), "ln")}
          >
            ln
          </button>
          <button
            type="button"
            className={sciClass}
            onClick={() => applyUnary((x) => Math.log2(x), "log₂")}
          >
            log₂
          </button>

          <button
            type="button"
            className={sciClass}
            onClick={() => applyUnary((x) => Math.pow(10, x), "10ˣ")}
          >
            10ˣ
          </button>
          <button
            type="button"
            className={sciClass}
            onClick={() => applyUnary((x) => Math.exp(x), "eˣ")}
          >
            eˣ
          </button>
          <button
            type="button"
            className={sciClass}
            onClick={() => applyUnary((x) => Math.sin(toRad(x)), "sin")}
          >
            sin
          </button>
          <button
            type="button"
            className={sciClass}
            onClick={() => applyUnary((x) => Math.cos(toRad(x)), "cos")}
          >
            cos
          </button>
          <button
            type="button"
            className={sciClass}
            onClick={() => applyUnary((x) => Math.tan(toRad(x)), "tan")}
          >
            tan
          </button>

          <button
            type="button"
            className={sciClass}
            onClick={() =>
              applyUnary((x) => fromRad(Math.asin(x)), "sin⁻¹")
            }
          >
            sin⁻¹
          </button>
          <button
            type="button"
            className={sciClass}
            onClick={() =>
              applyUnary((x) => fromRad(Math.acos(x)), "cos⁻¹")
            }
          >
            cos⁻¹
          </button>
          <button
            type="button"
            className={sciClass}
            onClick={() =>
              applyUnary((x) => fromRad(Math.atan(x)), "tan⁻¹")
            }
          >
            tan⁻¹
          </button>
          <button
            type="button"
            className={sciClass}
            onClick={() => insertConst(Math.PI)}
          >
            π
          </button>
          <button
            type="button"
            className={sciClass}
            onClick={() => insertConst(Math.E)}
          >
            e
          </button>
        </div>
      </div>

      <p
        className={
          theme === "light" ? "text-[10px] text-slate-500" : "text-[10px] text-white/45"
        }
      >
        sin⁻¹/cos⁻¹/tan⁻¹ result in {angleMode === "deg" ? "degrees" : "radians"}.
      </p>

      <div className="grid grid-cols-4 gap-1.5">
        <button type="button" className={utilClass} onClick={clearAll}>
          C
        </button>
        <button type="button" className={utilClass} onClick={backspace}>
          ⌫
        </button>
        <button type="button" className={utilClass} onClick={percent}>
          %
        </button>
        <button type="button" className={opClass} onClick={() => inputOp("÷", "÷")}>
          ÷
        </button>

        {(["7", "8", "9"] as const).map((d) => (
          <button key={d} type="button" className={numClass} onClick={() => inputDigit(d)}>
            {d}
          </button>
        ))}
        <button type="button" className={opClass} onClick={() => inputOp("×", "×")}>
          ×
        </button>

        {(["4", "5", "6"] as const).map((d) => (
          <button key={d} type="button" className={numClass} onClick={() => inputDigit(d)}>
            {d}
          </button>
        ))}
        <button type="button" className={opClass} onClick={() => inputOp("-", "−")}>
          −
        </button>

        {(["1", "2", "3"] as const).map((d) => (
          <button key={d} type="button" className={numClass} onClick={() => inputDigit(d)}>
            {d}
          </button>
        ))}
        <button type="button" className={opClass} onClick={() => inputOp("+", "+")}>
          +
        </button>

        <button type="button" className={utilClass} onClick={toggleSign}>
          +/−
        </button>
        <button type="button" className={numClass} onClick={() => inputDigit("0")}>
          0
        </button>
        <button type="button" className={numClass} onClick={() => inputDigit(".")}>
          .
        </button>
        <button type="button" className={opClass} onClick={equals}>
          =
        </button>
      </div>
    </div>
  );
}

function StandardCalculatorPanel({ theme }: { theme: "dark" | "light" }) {
  const [display, setDisplay] = useState("0");
  const [memory, setMemory] = useState(0);
  const [value, setValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<CalcOp | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);

  const numClass =
    theme === "light"
      ? "rounded-lg border border-slate-200 bg-white py-3.5 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 min-h-[44px] sm:py-3"
      : "rounded-lg border border-white/20 bg-white py-3.5 text-sm font-semibold text-[#0a1628] shadow-sm hover:bg-white/90 min-h-[44px] sm:py-3";
  const opClass =
    "rounded-lg border border-[#E8C84A]/70 bg-[#E8C84A] py-3.5 text-sm font-bold text-[#0a1628] shadow-sm hover:bg-[#f0d56e] min-h-[44px] sm:py-3";
  const utilClass =
    theme === "light"
      ? "rounded-lg border border-slate-300 bg-slate-100 py-3 text-xs font-semibold text-slate-800 hover:bg-slate-200 min-h-[40px] sm:py-2.5"
      : "rounded-lg border border-white/25 bg-[#0a1628] py-3 text-xs font-semibold text-white/90 hover:bg-white/10 min-h-[40px] sm:py-2.5";

  const inputDigit = (d: string) => {
    if (waitingForOperand) {
      setDisplay(d === "." ? "0." : d);
      setWaitingForOperand(false);
    } else {
      if (d === ".") {
        if (display.includes(".")) return;
        setDisplay(display + ".");
      } else if (display === "0" && d !== ".") {
        setDisplay(d);
      } else {
        setDisplay(display + d);
      }
    }
  };

  const inputOp = (next: CalcOp) => {
    const inputValue = parseFloat(display);
    if (Number.isNaN(inputValue)) return;

    if (value === null) {
      setValue(inputValue);
    } else if (operator) {
      const nv = calculate(value, inputValue, operator);
      setDisplay(fmtDisplay(nv));
      setValue(nv);
    }
    setWaitingForOperand(true);
    setOperator(next);
  };

  const equals = () => {
    if (operator === null || value === null) return;
    const inputValue = parseFloat(display);
    if (Number.isNaN(inputValue)) return;
    const nv = calculate(value, inputValue, operator);
    setDisplay(fmtDisplay(nv));
    setValue(null);
    setOperator(null);
    setWaitingForOperand(true);
  };

  const clearAll = () => {
    setDisplay("0");
    setValue(null);
    setOperator(null);
    setWaitingForOperand(false);
  };

  const backspace = () => {
    if (waitingForOperand) return;
    if (display.length <= 1) setDisplay("0");
    else setDisplay(display.slice(0, -1));
  };

  const percent = () => {
    const n = parseFloat(display);
    if (Number.isNaN(n)) return;
    setDisplay(fmtDisplay(n / 100));
  };

  const toggleSign = () => {
    const n = parseFloat(display);
    if (Number.isNaN(n)) return;
    setDisplay(fmtDisplay(-n));
  };

  const memAdd = () => {
    const n = parseFloat(display);
    if (Number.isNaN(n)) return;
    setMemory((m) => m + n);
  };
  const memSub = () => {
    const n = parseFloat(display);
    if (Number.isNaN(n)) return;
    setMemory((m) => m - n);
  };
  const memRecall = () => {
    setDisplay(fmtDisplay(memory));
    setWaitingForOperand(true);
  };
  const memClear = () => setMemory(0);

  const screenBg =
    theme === "light"
      ? "border border-slate-200 bg-slate-50 text-slate-900"
      : "border border-white/15 bg-[#050d18] text-white";

  return (
    <div className="space-y-2">
      <div
        className={`min-h-[3rem] rounded-lg px-3 py-2 text-right text-xl font-semibold tabular-nums tracking-tight ${screenBg}`}
      >
        {display}
      </div>
      <p
        className={
          theme === "light"
            ? "text-[10px] text-slate-500"
            : "text-[10px] text-white/40"
        }
      >
        M: {memory !== 0 ? fmtDisplay(memory) : "0"}
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        <button type="button" className={utilClass} onClick={memClear}>
          MC
        </button>
        <button type="button" className={utilClass} onClick={memRecall}>
          MR
        </button>
        <button type="button" className={utilClass} onClick={memSub}>
          M−
        </button>
        <button type="button" className={utilClass} onClick={memAdd}>
          M+
        </button>

        <button type="button" className={utilClass} onClick={clearAll}>
          C
        </button>
        <button type="button" className={utilClass} onClick={backspace}>
          ⌫
        </button>
        <button type="button" className={utilClass} onClick={percent}>
          %
        </button>
        <button type="button" className={opClass} onClick={() => inputOp("÷")}>
          ÷
        </button>

        {(["7", "8", "9"] as const).map((d) => (
          <button
            key={d}
            type="button"
            className={numClass}
            onClick={() => inputDigit(d)}
          >
            {d}
          </button>
        ))}
        <button type="button" className={opClass} onClick={() => inputOp("×")}>
          ×
        </button>

        {(["4", "5", "6"] as const).map((d) => (
          <button
            key={d}
            type="button"
            className={numClass}
            onClick={() => inputDigit(d)}
          >
            {d}
          </button>
        ))}
        <button type="button" className={opClass} onClick={() => inputOp("-")}>
          −
        </button>

        {(["1", "2", "3"] as const).map((d) => (
          <button
            key={d}
            type="button"
            className={numClass}
            onClick={() => inputDigit(d)}
          >
            {d}
          </button>
        ))}
        <button type="button" className={opClass} onClick={() => inputOp("+")}>
          +
        </button>

        <button type="button" className={utilClass} onClick={toggleSign}>
          +/−
        </button>
        <button type="button" className={numClass} onClick={() => inputDigit("0")}>
          0
        </button>
        <button type="button" className={numClass} onClick={() => inputDigit(".")}>
          .
        </button>
        <button type="button" className={opClass} onClick={equals}>
          =
        </button>
      </div>
    </div>
  );
}

function num(v: string): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function inpCls(theme: "dark" | "light") {
  return theme === "light"
    ? "mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
    : "mt-0.5 w-full rounded border border-white/20 bg-[#0a1628] px-2 py-1.5 text-sm text-white";
}

type OhmSolution = {
  v: number;
  i: number;
  r: number;
  p: number;
  formula: string;
};

function solveOhm(
  vs: string,
  is: string,
  rs: string,
  ps: string,
): OhmSolution | null {
  const V = num(vs);
  const I = num(is);
  const R = num(rs);
  const P = num(ps);
  const filled = [vs, is, rs, ps].filter((s) => s.trim() !== "").length;
  const known = [V, I, R, P].filter((x) => x != null).length;
  if (filled < 2 || known < 2) return null;

  let vv = V,
    ii = I,
    rr = R,
    pp = P;
  let formula = "";

  if (vv != null && ii != null) {
    rr = vv / ii;
    pp = vv * ii;
    formula = "R = V ÷ I; P = V × I";
  } else if (vv != null && rr != null && rr !== 0) {
    ii = vv / rr;
    pp = vv * ii;
    formula = "I = V ÷ R; P = V × I";
  } else if (ii != null && rr != null) {
    vv = ii * rr;
    pp = vv * ii;
    formula = "V = I × R; P = V × I";
  } else if (vv != null && pp != null && vv !== 0) {
    ii = pp / vv;
    rr = vv / ii;
    formula = "I = P ÷ V; R = V ÷ I";
  } else if (ii != null && pp != null && ii !== 0) {
    vv = pp / ii;
    rr = vv / ii;
    formula = "V = P ÷ I; R = V ÷ I";
  } else if (rr != null && pp != null && rr !== 0) {
    ii = Math.sqrt(pp / rr);
    vv = ii * rr;
    formula = "I = √(P ÷ R); V = I × R";
  } else {
    return null;
  }

  return {
    v: Math.round(vv! * 1000) / 1000,
    i: Math.round(ii! * 1000) / 1000,
    r: Math.round(rr! * 1000) / 1000,
    p: Math.round(pp! * 1000) / 1000,
    formula,
  };
}

function TabActions({
  onClear,
  onCopy,
  copyDisabled,
  showCalculate,
  onCalculate,
}: {
  onClear: () => void;
  onCopy: () => void;
  copyDisabled: boolean;
  showCalculate: boolean;
  onCalculate: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-3">
      {showCalculate ? (
        <button
          type="button"
          onClick={onCalculate}
          className="rounded-lg bg-[#E8C84A] px-3 py-2 text-xs font-bold text-[#0a1628]"
        >
          Calculate
        </button>
      ) : null}
      <button
        type="button"
        onClick={onClear}
        className="rounded-lg border border-white/25 px-3 py-2 text-xs font-semibold text-white/90 hover:bg-white/10"
      >
        Clear
      </button>
      <button
        type="button"
        disabled={copyDisabled}
        onClick={onCopy}
        className="rounded-lg border border-white/25 px-3 py-2 text-xs font-semibold text-white/90 hover:bg-white/10 disabled:opacity-40"
      >
        Copy result
      </button>
    </div>
  );
}

function OhmLawPanel({ theme }: { theme: "dark" | "light" }) {
  const [v, setV] = useState("");
  const [i, setI] = useState("");
  const [r, setR] = useState("");
  const [p, setP] = useState("");
  const [, bump] = useState(0);

  const solution = useMemo(() => solveOhm(v, i, r, p), [v, i, r, p]);
  const numericKnown = [num(v), num(i), num(r), num(p)].filter(
    (x) => x != null,
  ).length;
  const canCalc = numericKnown >= 2;

  const clear = () => {
    setV("");
    setI("");
    setR("");
    setP("");
  };

  const copy = async () => {
    if (!solution) return;
    const text = `V = ${solution.v} V, I = ${solution.i} A, R = ${solution.r} Ω, P = ${solution.p} W\nUsing: ${solution.formula}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-white/50">
        Enter any two of V, I, R, or P. Values update automatically when valid.
      </p>
      <label className="block">
        <span className="text-xs text-white/70">V (volts)</span>
        <input
          className={inpCls(theme)}
          value={v}
          onChange={(e) => setV(e.target.value)}
          inputMode="decimal"
        />
      </label>
      <label className="block">
        <span className="text-xs text-white/70">I (amps)</span>
        <input
          className={inpCls(theme)}
          value={i}
          onChange={(e) => setI(e.target.value)}
          inputMode="decimal"
        />
      </label>
      <label className="block">
        <span className="text-xs text-white/70">R (ohms)</span>
        <input
          className={inpCls(theme)}
          value={r}
          onChange={(e) => setR(e.target.value)}
          inputMode="decimal"
        />
      </label>
      <label className="block">
        <span className="text-xs text-white/70">P (watts)</span>
        <input
          className={inpCls(theme)}
          value={p}
          onChange={(e) => setP(e.target.value)}
          inputMode="decimal"
        />
      </label>
      {solution ? (
        <div className="rounded-lg border border-[#E8C84A]/30 bg-[#E8C84A]/10 p-3 text-sm">
          <p className="font-semibold text-[#E8C84A]">Result</p>
          <ul className="mt-2 space-y-1 text-white/90">
            <li>V = {solution.v} V</li>
            <li>I = {solution.i} A</li>
            <li>R = {solution.r} Ω</li>
            <li>P = {solution.p} W</li>
          </ul>
          <p className="mt-2 text-xs text-white/50">Using: {solution.formula}</p>
        </div>
      ) : canCalc ? (
        <p className="text-xs text-amber-200/90">
          Could not resolve — check values (need two independent quantities).
        </p>
      ) : null}
      <TabActions
        showCalculate={canCalc}
        onCalculate={() => bump((x) => x + 1)}
        onClear={clear}
        onCopy={() => void copy()}
        copyDisabled={!solution}
      />
    </div>
  );
}

function PowerPanel({ theme }: { theme: "dark" | "light" }) {
  const [volts, setVolts] = useState("240");
  const [kw, setKw] = useState("");
  const [amps, setAmps] = useState("");
  const [hp, setHp] = useState("");
  const [watts, setWatts] = useState("");
  const [pfKw, setPfKw] = useState("");
  const [pfKva, setPfKva] = useState("");

  const v = num(volts);
  const k = num(kw);
  const a = num(amps);
  const h = num(hp);
  const w = num(watts);
  const pfK = num(pfKw);
  const pfKv = num(pfKva);

  const kwToA =
    k != null && v != null && v !== 0
      ? { val: (k * 1000) / v, formula: "I = (kW × 1000) ÷ V" }
      : null;
  const aToKw =
    a != null && v != null
      ? { val: (a * v) / 1000, formula: "kW = (V × I) ÷ 1000" }
      : null;
  const hpW =
    h != null
      ? { val: h * 746, formula: "W = HP × 746" }
      : null;
  const wHp =
    w != null
      ? { val: w / 746, formula: "HP = W ÷ 746" }
      : null;
  const kvaVal =
    v != null && a != null
      ? { val: (v * a) / 1000, formula: "kVA = (V × I) ÷ 1000" }
      : null;
  const pf =
    pfK != null && pfKv != null && pfKv !== 0
      ? { val: pfK / pfKv, formula: "PF = kW ÷ kVA" }
      : null;

  const canCalc =
    (k != null && v != null && v !== 0) ||
    (a != null && v != null) ||
    h != null ||
    w != null ||
    (v != null && a != null) ||
    (pfK != null && pfKv != null && pfKv !== 0);

  const clear = () => {
    setVolts("240");
    setKw("");
    setAmps("");
    setHp("");
    setWatts("");
    setPfKw("");
    setPfKva("");
  };

  const resultLines: string[] = [];
  if (kwToA)
    resultLines.push(`${kwToA.formula} → ${Math.round(kwToA.val * 100) / 100} A`);
  if (aToKw)
    resultLines.push(`${aToKw.formula} → ${Math.round(aToKw.val * 1000) / 1000} kW`);
  if (hpW)
    resultLines.push(`${hpW.formula} → ${Math.round(hpW.val)} W`);
  if (wHp)
    resultLines.push(`${wHp.formula} → ${Math.round(wHp.val * 1000) / 1000} HP`);
  if (kvaVal)
    resultLines.push(`${kvaVal.formula} → ${Math.round(kvaVal.val * 1000) / 1000} kVA`);
  if (pf)
    resultLines.push(`${pf.formula} → ${Math.round(pf.val * 1000) / 1000}`);

  const copy = async () => {
    if (resultLines.length === 0) return;
    try {
      await navigator.clipboard.writeText(resultLines.join("\n"));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <label>
        <span className="text-xs text-white/70">Volts (for conversions)</span>
        <input
          className={inpCls(theme)}
          value={volts}
          onChange={(e) => setVolts(e.target.value)}
          inputMode="decimal"
        />
      </label>
      <div className="rounded border border-white/10 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={inpCls(theme) + " max-w-[8rem]"}
            placeholder="kW"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            inputMode="decimal"
          />
          <span className="text-white/80">
            →{" "}
            {kwToA
              ? `${Math.round(kwToA.val * 100) / 100} A`
              : "—"}
          </span>
        </div>
        {kwToA ? (
          <p className="mt-1 text-xs text-white/45">{kwToA.formula}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className={inpCls(theme) + " max-w-[8rem]"}
            placeholder="A"
            value={amps}
            onChange={(e) => setAmps(e.target.value)}
            inputMode="decimal"
          />
          <span className="text-white/80">
            →{" "}
            {aToKw
              ? `${Math.round(aToKw.val * 1000) / 1000} kW`
              : "—"}
          </span>
        </div>
        {aToKw ? (
          <p className="mt-1 text-xs text-white/45">{aToKw.formula}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={inpCls(theme) + " max-w-[8rem]"}
          placeholder="HP"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
          inputMode="decimal"
        />
        <span className="text-white/80">
          {hpW ? `${Math.round(hpW.val)} W` : "—"}
        </span>
      </div>
      {hpW ? (
        <p className="text-xs text-white/45">{hpW.formula}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={inpCls(theme) + " max-w-[8rem]"}
          placeholder="W"
          value={watts}
          onChange={(e) => setWatts(e.target.value)}
          inputMode="decimal"
        />
        <span className="text-white/80">
          {wHp
            ? `${Math.round(wHp.val * 1000) / 1000} HP`
            : "—"}
        </span>
      </div>
      {wHp ? (
        <p className="text-xs text-white/45">{wHp.formula}</p>
      ) : null}
      <div className="text-white/80">
        kVA (from V × I above):{" "}
        {kvaVal
          ? `${Math.round(kvaVal.val * 1000) / 1000} kVA`
          : "—"}
      </div>
      {kvaVal ? (
        <p className="text-xs text-white/45">{kvaVal.formula}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <input
          className={inpCls(theme) + " w-24"}
          placeholder="kW"
          value={pfKw}
          onChange={(e) => setPfKw(e.target.value)}
          inputMode="decimal"
        />
        <input
          className={inpCls(theme) + " w-24"}
          placeholder="kVA"
          value={pfKva}
          onChange={(e) => setPfKva(e.target.value)}
          inputMode="decimal"
        />
        <span className="self-center text-white/80">
          PF ={" "}
          {pf ? Math.round(pf.val * 1000) / 1000 : "—"}
        </span>
      </div>
      {pf ? (
        <p className="text-xs text-white/45">{pf.formula}</p>
      ) : null}
      <TabActions
        showCalculate={!!canCalc}
        onCalculate={() => {}}
        onClear={clear}
        onCopy={() => void copy()}
        copyDisabled={resultLines.length === 0}
      />
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
  const vll =
    vl != null
      ? `${Math.round(vl * Math.sqrt(3) * 100) / 100} V (line-line est.)`
      : "—";

  const lines: string[] = [];
  if (w.trim()) lines.push(`W → kW: ${kwFromW} (kW = W ÷ 1000)`);
  if (a.trim()) lines.push(`A → mA: ${maFromA} (mA = A × 1000)`);
  if (vLn.trim())
    lines.push(
      `V_LN ${vLn} → V_LL est.: ${vll} (V_LL ≈ V_LN × √3, 3φ)`,
    );
  if (ft.trim()) lines.push(`ft → m: ${mFromFt} (m = ft × 0.3048)`);
  if (btu.trim()) lines.push(`BTU/hr → W: ${wFromBtu} (W ≈ BTU × 0.293)`);

  const canCalc = [w, a, ft, btu, vLn].some((s) => s.trim() !== "");

  const clear = () => {
    setW("");
    setA("");
    setFt("");
    setBtu("");
    setVLn("120");
  };

  const copy = async () => {
    if (lines.length === 0) return;
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={inpCls(theme) + " max-w-[9rem]"}
          placeholder="Watts"
          value={w}
          onChange={(e) => setW(e.target.value)}
          inputMode="decimal"
        />
        <span className="text-white/80">{kwFromW}</span>
      </div>
      {w.trim() ? (
        <p className="text-xs text-white/45">kW = W ÷ 1000</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={inpCls(theme) + " max-w-[9rem]"}
          placeholder="Amps"
          value={a}
          onChange={(e) => setA(e.target.value)}
          inputMode="decimal"
        />
        <span className="text-white/80">{maFromA}</span>
      </div>
      {a.trim() ? (
        <p className="text-xs text-white/45">mA = A × 1000</p>
      ) : null}
      <label>
        <span className="text-xs text-white/70">Line-to-neutral V (→ 3φ line-line)</span>
        <input
          className={inpCls(theme)}
          value={vLn}
          onChange={(e) => setVLn(e.target.value)}
          inputMode="decimal"
        />
        <span className="mt-1 block text-sm text-white/75">{vll}</span>
      </label>
      {vLn.trim() ? (
        <p className="text-xs text-white/45">V_LL ≈ V_LN × √3</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={inpCls(theme) + " max-w-[9rem]"}
          placeholder="Feet"
          value={ft}
          onChange={(e) => setFt(e.target.value)}
          inputMode="decimal"
        />
        <span className="text-white/80">{mFromFt}</span>
      </div>
      {ft.trim() ? (
        <p className="text-xs text-white/45">m = ft × 0.3048</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={inpCls(theme) + " max-w-[9rem]"}
          placeholder="BTU/hr"
          value={btu}
          onChange={(e) => setBtu(e.target.value)}
          inputMode="decimal"
        />
        <span className="text-white/80">{wFromBtu}</span>
      </div>
      {btu.trim() ? (
        <p className="text-xs text-white/45">W ≈ BTU/hr × 0.293</p>
      ) : null}
      <TabActions
        showCalculate={canCalc}
        onCalculate={() => {}}
        onClear={clear}
        onCopy={() => void copy()}
        copyDisabled={lines.length === 0}
      />
    </div>
  );
}

export function FloatingCalculatorWidget() {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [tab, setTab] = useState<Tab>("calc");
  const [mobileLayout, setMobileLayout] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setMobileLayout(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const panelBg =
    theme === "light"
      ? "border-slate-300 bg-white text-slate-900 shadow-xl"
      : "border-[#E8C84A]/35 bg-[#071422] text-white shadow-2xl shadow-black/50";

  const fabBottom = mobileLayout
    ? "bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))]"
    : "bottom-5";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setMinimized(false);
        }}
        className={`fixed right-4 z-[100] flex min-h-[48px] items-center gap-2 rounded-full border-2 border-[#E8C84A]/60 bg-[#0d2847] px-4 py-3 text-sm font-bold text-[#E8C84A] shadow-lg hover:bg-[#123a5c] sm:right-5 ${fabBottom}`}
        aria-label="Open calculator"
      >
        ⚡ Calc
      </button>

      {open && !minimized ? (
        <div
          className={
            mobileLayout
              ? `fixed inset-x-0 bottom-0 z-[101] flex max-h-[min(88dvh,36rem)] flex-col rounded-t-2xl border-x border-t ${panelBg}`
              : `fixed bottom-5 right-5 z-[101] flex w-[min(100vw-1.5rem,28rem)] flex-col rounded-xl border ${panelBg}`
          }
        >
          <div className="flex items-center justify-between border-b border-[#E8C84A]/25 px-3 py-2.5">
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
                ["calc", "Calculator"],
                ["sci", "Scientific"],
                ["ohm", "Ohm"],
                ["power", "Power"],
                ["units", "Units"],
              ] as const
            ).map(([id, lab]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex-1 py-2.5 text-xs font-semibold sm:text-sm ${
                  tab === id
                    ? "bg-[#E8C84A]/20 text-[#E8C84A]"
                    : "text-white/60 hover:bg-white/5"
                }`}
              >
                {lab}
              </button>
            ))}
          </div>
          <div className="max-h-[min(72vh,32rem)] overflow-y-auto p-4 text-sm">
            {tab === "calc" ? <StandardCalculatorPanel theme={theme} /> : null}
            {tab === "sci" ? <ScientificCalculatorPanel theme={theme} /> : null}
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
          className={`fixed z-[101] rounded-full border border-[#E8C84A]/50 bg-[#0a1628] px-3 py-2 text-xs text-[#E8C84A] ${mobileLayout ? `right-4 ${fabBottom}` : "bottom-5 right-28"}`}
        >
          Calc ▲
        </button>
      ) : null}
    </>
  );
}
