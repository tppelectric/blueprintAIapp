"use client";

import type {
  ProjectEstimateMetricPoint,
  ProjectEstimateMetricsSummary
} from "@package/types";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../../../components/app-shell";

type MetricsPayload = {
  history: ProjectEstimateMetricPoint[];
  summary: ProjectEstimateMetricsSummary;
};

export default function ProjectMetricsPage() {
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  const [status, setStatus] = useState("Loading project metrics...");
  const [data, setData] = useState<MetricsPayload | null>(null);

  useEffect(() => {
    void (async () => {
      const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
      const response = await fetch(`/api/projects/${params.projectId}/estimate/metrics${query}`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as Partial<MetricsPayload> & { message?: string };

      if (!response.ok || !payload.summary || !payload.history) {
        setStatus(payload.message ?? "Could not load metrics.");
        return;
      }

      setData({
        summary: payload.summary,
        history: payload.history
      });
      setStatus("");
    })();
  }, [jobId, params.projectId]);

  return (
    <AppShell title="Project Cost Metrics">
      {!data ? (
        <section className="card">{status}</section>
      ) : (
        <>
          <section className="card">
            <h3>Summary</h3>
            <table>
              <tbody>
                <tr><td>Saved Estimates</td><td>{data.summary.count}</td></tr>
                <tr><td>Average Price Per Point</td><td>${data.summary.avgPricePerPoint}</td></tr>
                <tr><td>Average Price Per Sq Ft</td><td>${data.summary.avgPricePerSqFt}</td></tr>
                <tr><td>Latest Total Cost</td><td>${data.summary.latestTotalCost}</td></tr>
                <tr><td>Latest Total Points</td><td>{data.summary.latestTotalPoints}</td></tr>
              </tbody>
            </table>
          </section>

          <section className="card section-gap">
            <h3>Estimate History</h3>
            <table>
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Estimate ID</th>
                  <th>Total Points</th>
                  <th>Total Cost</th>
                  <th>Price / Point</th>
                  <th>Price / Sq Ft</th>
                  <th>Labor Hours</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((entry) => (
                  <tr key={entry.estimateId}>
                    <td>{new Date(entry.createdAt).toLocaleString()}</td>
                    <td>{entry.estimateId}</td>
                    <td>{entry.totalPoints}</td>
                    <td>${entry.totalProjectCost}</td>
                    <td>${entry.pricePerPoint}</td>
                    <td>${entry.pricePerSqFt}</td>
                    <td>{entry.laborHours}</td>
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
