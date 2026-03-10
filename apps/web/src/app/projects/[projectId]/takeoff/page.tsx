"use client";

import type { LightingCircuit, MaterialEstimate, RoomTakeoff } from "@package/types";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../../../components/app-shell";

type TakeoffPayload = {
  takeoffs: RoomTakeoff[];
  materials: MaterialEstimate[];
  circuits: LightingCircuit[];
};

function parseRoomDisplay(name: string): { baseName: string; floorLabel: string | null } {
  const match = name.match(/^(.*)\(([^)]+)\)\s*$/);
  if (!match) {
    return { baseName: name, floorLabel: null };
  }
  return {
    baseName: match[1].trim(),
    floorLabel: match[2].trim() || null
  };
}

export default function TakeoffPage() {
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  const [data, setData] = useState<TakeoffPayload | null>(null);
  const [status, setStatus] = useState("Loading takeoff summary...");

  useEffect(() => {
    void (async () => {
      const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
      const response = await fetch(`/api/projects/${params.projectId}/takeoff${query}`, { cache: "no-store" });
      const payload = (await response.json()) as { message?: string } & Partial<TakeoffPayload>;

      if (!response.ok || !payload.takeoffs || !payload.materials || !payload.circuits) {
        setStatus(payload.message ?? "Could not load takeoff summary.");
        return;
      }

      setData({
        takeoffs: payload.takeoffs,
        materials: payload.materials,
        circuits: payload.circuits
      });
      setStatus("");
    })();
  }, [jobId, params.projectId]);

  return (
    <AppShell title="Takeoff Summary">
      {!data ? (
        <section className="card">{status}</section>
      ) : (
        <>
          <section className="card">
            <h3>Room-Based Counts</h3>
            <table>
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Outlets</th>
                  <th>Switches</th>
                  <th>Dimmers</th>
                  <th>Lights</th>
                  <th>Recessed</th>
                  <th>Fans</th>
                  <th>CAT6</th>
                  <th>Cameras</th>
                  <th>Smoke/CO</th>
                </tr>
              </thead>
              <tbody>
                {data.takeoffs.map((takeoff) => {
                  const display = parseRoomDisplay(takeoff.roomName);
                  return (
                    <tr key={takeoff.roomId}>
                      <td>
                        <div className="row">
                          <span>{display.baseName}</span>
                          {display.floorLabel && <span className="floor-chip">{display.floorLabel}</span>}
                        </div>
                      </td>
                      <td>{takeoff.counts.outlet}</td>
                      <td>{takeoff.counts.switch}</td>
                      <td>{takeoff.counts.dimmer}</td>
                      <td>{takeoff.counts.light}</td>
                      <td>{takeoff.counts.recessed_light}</td>
                      <td>{takeoff.counts.fan}</td>
                      <td>{takeoff.counts.cat6}</td>
                      <td>{takeoff.counts.camera}</td>
                      <td>{takeoff.counts.smoke_co}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="card section-gap">
            <h3>Lighting Circuits</h3>
            <table>
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Fixtures</th>
                  <th>Assumed Watts (60W each)</th>
                  <th>Estimated Amps</th>
                  <th>Dimmer Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {data.circuits.map((circuit) => {
                  const display = parseRoomDisplay(circuit.roomName);
                  return (
                    <tr key={circuit.id}>
                      <td>
                        <div className="row">
                          <span>{display.baseName}</span>
                          {display.floorLabel && <span className="floor-chip">{display.floorLabel}</span>}
                        </div>
                      </td>
                      <td>{circuit.fixtureCount}</td>
                      <td>{circuit.assumedWatts}</td>
                      <td>{circuit.estimatedAmps}A</td>
                      <td>{circuit.dimmerType === "high_capacity_led_dimmer" ? "Use larger LED dimmer" : "Standard 150W LED dimmer"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="muted">Lighting circuits are kept under a 12A design target before final engineering review.</p>
          </section>

          <section className="card section-gap">
            <h3>Material Estimates from Scale-Based Heuristics</h3>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit</th>
                </tr>
              </thead>
              <tbody>
                {data.materials.map((item) => (
                  <tr key={item.id}>
                    <td>{item.itemCode}</td>
                    <td>{item.description}</td>
                    <td>{item.quantity}</td>
                    <td>{item.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </AppShell>
  );
}
