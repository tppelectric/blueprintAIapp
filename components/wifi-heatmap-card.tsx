"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const useIsoLayoutEffect =
  typeof document !== "undefined" ? useLayoutEffect : useEffect;
import type { WifiAnalyzerInputs, WifiAnalyzerResults } from "@/lib/wifi-analyzer-engine";
import {
  averageIndoorCoverageRadiusFt,
  blueprintContainRect,
  buildHeatMapRoomLayoutNorm,
  canvasToNormalized,
  drawWifiHeatMap,
  exportHeatMapPng,
  hitTestMarker,
  type HeatMapMarker,
  snapNormalized,
  suggestWifiHeatMapMarkers,
} from "@/lib/wifi-heatmap";

function renumberMarkers(list: HeatMapMarker[]): HeatMapMarker[] {
  const indoor = list.filter((m) => m.kind === "indoor");
  const outdoor = list.filter((m) => m.kind === "outdoor");
  return [
    ...indoor.map((m, i) => ({ ...m, label: i + 1 })),
    ...outdoor.map((m, i) => ({ ...m, label: i + 1 })),
  ];
}

type Props = {
  inputs: WifiAnalyzerInputs;
  results: WifiAnalyzerResults;
  blueprintDataUrl: string | null;
  calcGeneration: number;
};

export function WifiHeatMapCard({
  inputs,
  results,
  blueprintDataUrl,
  calcGeneration,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [markers, setMarkers] = useState<HeatMapMarker[]>([]);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [heatMapInitError, setHeatMapInitError] = useState<string | null>(null);
  const dragRef = useRef<{ id: string } | null>(null);
  const movedRef = useRef(false);

  useEffect(() => {
    if (!blueprintDataUrl) {
      setImg(null);
      return;
    }
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onerror = () => setImg(null);
    el.onload = () => setImg(el);
    el.src = blueprintDataUrl;
  }, [blueprintDataUrl]);

  useEffect(() => {
    setHeatMapInitError(null);
    try {
      const rows = results?.roomRows;
      if (!Array.isArray(rows)) {
        setMarkers([]);
        return;
      }
      setMarkers(
        suggestWifiHeatMapMarkers(
          inputs,
          results,
          Boolean(blueprintDataUrl),
        ),
      );
    } catch (e) {
      console.error("[WifiHeatMapCard] marker init failed:", e);
      setMarkers([]);
      setHeatMapInitError("Could not build heat map layout from results.");
    }
  }, [calcGeneration, inputs, results, blueprintDataUrl]);

  const radiusFt = useMemo(
    () => averageIndoorCoverageRadiusFt(inputs),
    [inputs],
  );

  const buildingSpanFt = useMemo(() => {
    const b = results.buildingUsedSqFt || results.totalIndoorSqFt || 2000;
    return Math.max(b, results.totalIndoorSqFt || 0);
  }, [results]);

  const layoutRooms = useMemo(
    () => (!blueprintDataUrl ? buildHeatMapRoomLayoutNorm(inputs) : null),
    [blueprintDataUrl, inputs],
  );

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = Math.min(
      2,
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    );
    const measured = Math.floor(wrap.getBoundingClientRect().width);
    const rw = Math.max(320, measured || wrap.clientWidth || 320);
    const rh = Math.max(240, Math.round((rw * 3) / 4));
    canvas.width = Math.floor(rw * dpr);
    canvas.height = Math.floor(rh * dpr);
    canvas.style.width = `${rw}px`;
    canvas.style.height = `${rh}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    try {
      drawWifiHeatMap(
        ctx,
        rw,
        rh,
        img,
        markers,
        radiusFt,
        buildingSpanFt,
        layoutRooms,
      );
    } catch (e) {
      console.error("[WifiHeatMapCard] draw failed:", e);
    }
  }, [img, markers, radiusFt, buildingSpanFt, layoutRooms]);

  useIsoLayoutEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => redraw());
    });
    ro.observe(wrap);
    requestAnimationFrame(() => redraw());
    return () => ro.disconnect();
  }, [redraw]);

  const getRect = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rw = canvas.clientWidth;
    const rh = canvas.clientHeight;
    if (img?.naturalWidth)
      return blueprintContainRect(rw, rh, img.naturalWidth, img.naturalHeight);
    return { x: 0, y: 0, w: rw, h: rh };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const br = getRect();
    if (!br) return;
    const hit = hitTestMarker(markers, br, px, py);
    movedRef.current = false;
    if (hit) {
      dragRef.current = { id: hit.id };
      canvas.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    movedRef.current = true;
    const br = getRect();
    if (!br) return;
    const raw = canvasToNormalized(px, py, br);
    const sn = snapNormalized(raw.nx, raw.ny);
    const id = dragRef.current.id;
    setMarkers((prev) =>
      renumberMarkers(
        prev.map((m) => (m.id === id ? { ...m, nx: sn.nx, ny: sn.ny } : m)),
      ),
    );
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.detail > 1) return;
    if (movedRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const br = getRect();
    if (!br) return;
    const hit = hitTestMarker(markers, br, px, py);
    if (!hit) {
      const raw = canvasToNormalized(px, py, br);
      const sn = snapNormalized(raw.nx, raw.ny);
      setMarkers((prev) =>
        renumberMarkers([
          ...prev,
          {
            id: `hm-add-${Date.now()}`,
            nx: sn.nx,
            ny: sn.ny,
            kind: "indoor",
            label: 0,
          },
        ]),
      );
    }
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const br = getRect();
    if (!br) return;
    const hit = hitTestMarker(markers, br, px, py);
    if (hit) {
      setMarkers((prev) => renumberMarkers(prev.filter((m) => m.id !== hit.id)));
    }
  };

  const exportPng = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    redraw();
    requestAnimationFrame(async () => {
      const blob = await exportHeatMapPng(canvas);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wifi-heatmap-${(inputs.projectName || "export").replace(/\s+/g, "-")}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <section className="rounded-2xl border border-cyan-500/30 bg-cyan-950/20 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-cyan-100">
            Coverage heat map
          </h2>
          <p className="mt-1 max-w-xl text-xs text-white/60">
            Green / yellow / orange = modeled coverage ({Math.round(radiusFt)}{" "}
            ft nominal radius). Blue = indoor AP, green ring = outdoor. Dashed
            ring = nominal coverage edge. Drag markers; double-click removes;
            single-click empty canvas adds indoor AP. Export adds TPP watermark.
            {!blueprintDataUrl
              ? " Without a PDF, rooms render as a proportional layout; colors update as you drag APs."
              : null}
          </p>
          {heatMapInitError ? (
            <p className="mt-2 text-xs text-amber-200/90">{heatMapInitError}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void exportPng()}
          className="rounded-lg border border-cyan-400/50 bg-cyan-500/15 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/25"
        >
          Export heat map (PNG)
        </button>
      </div>
      <div
        ref={wrapRef}
        className="mt-4 w-full min-h-[240px] min-w-0"
        style={{ minHeight: 240 }}
      >
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair rounded-lg border border-white/10 bg-[#0a1628]"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
        />
      </div>
    </section>
  );
}
