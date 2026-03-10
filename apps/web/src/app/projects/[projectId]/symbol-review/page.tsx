"use client";

import type { DashboardData, ElectricalSymbolType, SymbolDetection } from "@package/types";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../../../components/app-shell";

const OPTIONS: ElectricalSymbolType[] = [
  "outlet",
  "switch",
  "dimmer",
  "light",
  "recessed_light",
  "fan",
  "cat6",
  "speaker",
  "camera",
  "smoke_co"
];

export default function SymbolReviewPage() {
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [selectedType, setSelectedType] = useState<Record<string, ElectricalSymbolType>>({});
  const [status, setStatus] = useState("Loading symbol review queue...");

  useEffect(() => {
    void (async () => {
      const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
      const response = await fetch(`/api/projects/${params.projectId}/dashboard${query}`, { cache: "no-store" });
      const payload = (await response.json()) as { message?: string; dashboard?: DashboardData };

      if (!response.ok || !payload.dashboard) {
        setStatus(payload.message ?? "Could not load symbol review queue.");
        return;
      }

      setDashboard(payload.dashboard);
      setStatus("");
    })();
  }, [jobId, params.projectId]);

  async function confirm(detectionId: string, defaultType: ElectricalSymbolType) {
    const confirmedType = selectedType[detectionId] ?? defaultType;
    const response = await fetch(`/api/projects/${params.projectId}/symbol-review/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, detectionId, confirmedType })
    });

    if (!response.ok) {
      const payload = (await response.json()) as { message?: string };
      setStatus(payload.message ?? "Could not confirm symbol");
      return;
    }

    const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
    const refreshResp = await fetch(`/api/projects/${params.projectId}/dashboard${query}`, { cache: "no-store" });
    const refreshPayload = (await refreshResp.json()) as { dashboard?: DashboardData };
    if (refreshResp.ok && refreshPayload.dashboard) {
      setDashboard(refreshPayload.dashboard);
    }

    setStatus(`Confirmed ${detectionId} as ${confirmedType}.`);
    router.refresh();
  }

  const reviewQueue: SymbolDetection[] = dashboard ? dashboard.symbols.filter((item) => item.needsReview) : [];

  return (
    <AppShell title="Symbol Review Queue">
      {!dashboard ? (
        <section className="card">{status}</section>
      ) : (
        <section className="card">
          <p className="muted">
            Unclear symbols are compared against legends and flagged for confirmation. Confirmed mappings are saved to the symbol library.
          </p>

          <table>
            <thead>
              <tr>
                <th>Detection ID</th>
                <th>Room</th>
                <th>Detected Type</th>
                <th>Confidence</th>
                <th>Legend Match</th>
                <th>Confirm</th>
              </tr>
            </thead>
            <tbody>
              {reviewQueue.map((item) => {
                const room = dashboard.rooms.find((roomItem) => roomItem.id === item.roomId);
                return (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{room?.name ?? "Unknown"}</td>
                    <td>{item.symbolType}</td>
                    <td>{Math.round(item.confidence * 100)}%</td>
                    <td>{item.legendMatchLabel ?? "No legend hint"}</td>
                    <td>
                      <div className="row">
                        <select
                          value={selectedType[item.id] ?? item.symbolType}
                          onChange={(event) =>
                            setSelectedType((current) => ({
                              ...current,
                              [item.id]: event.target.value as ElectricalSymbolType
                            }))
                          }
                        >
                          {OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <button type="button" onClick={() => void confirm(item.id, item.symbolType)}>
                          Confirm
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {status && <p className="status-text">{status}</p>}
        </section>
      )}
    </AppShell>
  );
}
