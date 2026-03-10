"use client";

import type { ProjectMaterialListRecord } from "@package/types";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../../../components/app-shell";

type Payload = {
  materialList: ProjectMaterialListRecord;
};

export default function ProjectMaterialListPage() {
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  const [status, setStatus] = useState("Loading material list...");
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    void loadLatest();
  }, [jobId, params.projectId]);

  async function loadLatest() {
    const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
    const response = await fetch(`/api/projects/${params.projectId}/material-list${query}`, {
      cache: "no-store"
    });
    const payload = (await response.json()) as Partial<Payload> & { message?: string };

    if (!response.ok || !payload.materialList) {
      setData(null);
      setStatus(payload.message ?? "No saved material list yet.");
      return;
    }

    setData({ materialList: payload.materialList });
    setStatus("");
  }

  async function generateMaterialList() {
    setStatus("Generating material list...");
    const response = await fetch(`/api/projects/${params.projectId}/material-list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId })
    });
    const payload = (await response.json()) as Partial<Payload> & { message?: string };

    if (!response.ok || !payload.materialList) {
      setStatus(payload.message ?? "Could not generate material list.");
      return;
    }

    setData({ materialList: payload.materialList });
    setStatus("Material list generated and saved.");
  }

  return (
    <AppShell title="Project Material List">
      <section className="card">
        <p className="muted">
          Generates project materials from current takeoff data and stores each run for project history.
        </p>
        <div className="row actions">
          <button type="button" onClick={generateMaterialList}>
            Generate Material List
          </button>
        </div>
      </section>

      {status && <section className="card section-gap"><p className="status-text">{status}</p></section>}

      {data && (
        <section className="card section-gap">
          <h3>Latest Material List</h3>
          <p className="muted">
            List ID: {data.materialList.listId} | Source: {data.materialList.source} | Created: {new Date(data.materialList.createdAt).toLocaleString()}
          </p>
          <table>
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Description</th>
                <th>Quantity</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {data.materialList.items.map((item) => (
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
      )}
    </AppShell>
  );
}
