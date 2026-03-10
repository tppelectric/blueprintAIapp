"use client";

import type { DashboardData } from "@package/types";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../../../components/app-shell";

export default function SheetsPage() {
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [status, setStatus] = useState("Loading sheets...");

  useEffect(() => {
    void (async () => {
      const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
      const response = await fetch(`/api/projects/${params.projectId}/dashboard${query}`, { cache: "no-store" });
      const payload = (await response.json()) as { message?: string; dashboard?: DashboardData };

      if (!response.ok || !payload.dashboard) {
        setStatus(payload.message ?? "Could not load sheets.");
        return;
      }

      setDashboard(payload.dashboard);
      setStatus("");
    })();
  }, [jobId, params.projectId]);

  return (
    <AppShell title="Sheet Viewer">
      {!dashboard ? (
        <section className="card">{status}</section>
      ) : (
        <section className="card">
          <table>
            <thead>
              <tr>
                <th>Sheet Number</th>
                <th>Title</th>
                <th>Page</th>
                <th>Scale</th>
                <th>File</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.sheets.map((sheet) => (
                <tr key={sheet.id}>
                  <td>{sheet.sheetNumber}</td>
                  <td>{sheet.title}</td>
                  <td>{sheet.pageNumber}</td>
                  <td>{sheet.scale}</td>
                  <td>{sheet.fileName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </AppShell>
  );
}
