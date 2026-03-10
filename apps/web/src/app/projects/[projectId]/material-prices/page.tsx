"use client";

import type { ProjectMaterialPriceSnapshot } from "@package/types";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../../../components/app-shell";

type Payload = {
  latest: ProjectMaterialPriceSnapshot | null;
  history: ProjectMaterialPriceSnapshot[];
  nextDueAt: string | null;
};

export default function ProjectMaterialPricesPage() {
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  const [status, setStatus] = useState("Loading material price snapshots...");
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    void loadSnapshots();
  }, [jobId, params.projectId]);

  async function loadSnapshots() {
    const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
    const response = await fetch(`/api/projects/${params.projectId}/material-prices${query}`, {
      cache: "no-store"
    });
    const payload = (await response.json()) as Partial<Payload> & { message?: string };

    if (!response.ok || !payload.history) {
      setData(null);
      setStatus(payload.message ?? "Could not load material prices.");
      return;
    }

    setData({
      latest: payload.latest ?? null,
      history: payload.history,
      nextDueAt: payload.nextDueAt ?? null
    });
    setStatus("");
  }

  async function captureSnapshot() {
    setStatus("Capturing material price snapshot...");
    const response = await fetch(`/api/projects/${params.projectId}/material-prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "manual", jobId })
    });
    const payload = (await response.json()) as { message?: string };

    if (!response.ok) {
      setStatus(payload.message ?? "Could not capture snapshot.");
      return;
    }

    await loadSnapshots();
    setStatus("Material price snapshot captured.");
  }

  return (
    <AppShell title="Project Material Prices">
      <section className="card">
        <p className="muted">
          Tracks supplier pricing snapshots and supports a 30-day monitoring cadence.
        </p>
        <div className="row actions">
          <button type="button" onClick={captureSnapshot}>
            Capture Price Snapshot
          </button>
        </div>
      </section>

      {status && <section className="card section-gap"><p className="status-text">{status}</p></section>}

      {data && (
        <>
          <section className="card section-gap">
            <h3>Schedule</h3>
            <table>
              <tbody>
                <tr><td>Latest Snapshot</td><td>{data.latest ? new Date(data.latest.createdAt).toLocaleString() : "-"}</td></tr>
                <tr><td>Next Due</td><td>{data.nextDueAt ? new Date(data.nextDueAt).toLocaleString() : "-"}</td></tr>
              </tbody>
            </table>
          </section>

          <section className="card section-gap">
            <h3>Latest Price Table</h3>
            {!data.latest ? (
              <p className="muted">No snapshots yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Item</th>
                    <th>Brand</th>
                    <th>Prev</th>
                    <th>Current</th>
                    <th>Change %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.latest.prices.map((row) => (
                    <tr key={`${row.supplier}-${row.item}-${row.brand}`}>
                      <td>{row.supplier}</td>
                      <td>{row.item}</td>
                      <td>{row.brand}</td>
                      <td>${row.previousPrice}</td>
                      <td>${row.currentPrice}</td>
                      <td>{row.changePercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card section-gap">
            <h3>Snapshot History</h3>
            <table>
              <thead>
                <tr>
                  <th>Captured</th>
                  <th>Snapshot ID</th>
                  <th>Source</th>
                  <th>Rows</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((snapshot) => (
                  <tr key={snapshot.snapshotId}>
                    <td>{new Date(snapshot.createdAt).toLocaleString()}</td>
                    <td>{snapshot.snapshotId}</td>
                    <td>{snapshot.source}</td>
                    <td>{snapshot.prices.length}</td>
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
