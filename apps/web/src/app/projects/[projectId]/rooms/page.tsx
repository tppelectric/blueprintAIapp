"use client";

import type { DashboardData } from "@package/types";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../../../components/app-shell";

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

export default function RoomsPage() {
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [status, setStatus] = useState("Loading rooms...");

  useEffect(() => {
    void (async () => {
      const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
      const response = await fetch(`/api/projects/${params.projectId}/dashboard${query}`, { cache: "no-store" });
      const payload = (await response.json()) as { message?: string; dashboard?: DashboardData };

      if (!response.ok || !payload.dashboard) {
        setStatus(payload.message ?? "Could not load rooms.");
        return;
      }

      setDashboard(payload.dashboard);
      setStatus("");
    })();
  }, [jobId, params.projectId]);

  return (
    <AppShell title="Room List">
      {!dashboard ? (
        <section className="card">{status}</section>
      ) : (
        <section className="card">
          <table>
            <thead>
              <tr>
                <th>Room</th>
                <th>Area (sq ft)</th>
                <th>Sheet</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.rooms.map((room) => {
                const sheet = dashboard.sheets.find((item) => item.id === room.sheetId);
                const display = parseRoomDisplay(room.name);
                return (
                  <tr key={room.id}>
                    <td>
                      <div className="row">
                        <span>{display.baseName}</span>
                        {display.floorLabel && <span className="floor-chip">{display.floorLabel}</span>}
                      </div>
                    </td>
                    <td>{room.areaSqFt}</td>
                    <td>{sheet?.sheetNumber ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </AppShell>
  );
}
