"use client";

import type { PlatformDashboard } from "@package/types";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";

export default function PlatformDashboardPage() {
  const [data, setData] = useState<PlatformDashboard | null>(null);
  const [status, setStatus] = useState("Loading platform dashboard...");

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/platform/dashboard", { cache: "no-store" });
      const payload = (await response.json()) as { message?: string; dashboard?: PlatformDashboard };

      if (!response.ok || !payload.dashboard) {
        setStatus(payload.message ?? "Could not load dashboard.");
        return;
      }

      setData(payload.dashboard);
      setStatus("");
    })();
  }, []);

  return (
    <AppShell title="ElectricalEstimator AI Platform">
      {status && <section className="card"><p className="status-text">{status}</p></section>}

      {data && (
        <>
          <section className="card">
            <h3>{data.projectName}</h3>
            <p className="muted">Designed for residential, multifamily, and commercial estimating workflows.</p>
            <div className="row actions">
              <Link className="button-link secondary" href="/platform/load-calculator">
                Open Load Calculator
              </Link>
              <Link className="button-link secondary" href="/platform/wifi-analyzer">
                Open WiFi Analyzer
              </Link>
              <Link className="button-link secondary" href="/platform/tools">
                Open General Tools
              </Link>
            </div>
          </section>

          <section className="card section-gap">
            <h3>Estimate Metrics</h3>
            <table>
              <tbody>
                <tr><td>Total Points</td><td>{data.estimates.totalPoints}</td></tr>
                <tr><td>Price Per Point</td><td>${data.estimates.pricePerPoint}</td></tr>
                <tr><td>Total Labor Hours</td><td>{data.estimates.laborHours}</td></tr>
                <tr><td>Total Material Cost</td><td>${data.estimates.materialCost}</td></tr>
                <tr><td>Total Project Cost</td><td>${data.estimates.totalProjectCost}</td></tr>
                <tr><td>Price Per Sq Ft</td><td>${data.estimates.pricePerSqFt}</td></tr>
              </tbody>
            </table>
          </section>

          <section className="card section-gap">
            <h3>Load + Service</h3>
            <table>
              <tbody>
                <tr><td>Total VA</td><td>{data.loadCalculation.totalVa}</td></tr>
                <tr><td>Calculated Amps</td><td>{data.loadCalculation.calculatedAmps}</td></tr>
                <tr><td>Service Recommendation</td><td>{data.loadCalculation.recommendedServiceSize}</td></tr>
                <tr><td>Meter Socket</td><td>{data.serviceDesign.recommendedMeterSocket}</td></tr>
                <tr><td>CT Cabinet Required</td><td>{data.serviceDesign.ctCabinetRequired ? "Yes" : "No"}</td></tr>
              </tbody>
            </table>
          </section>

          <section className="card section-gap">
            <h3>Material Pricing (30-day monitor)</h3>
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
                {data.materialPrices.map((row) => (
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
          </section>

          <section className="card section-gap">
            <h3>Compliance Report</h3>
            <ul>
              {data.complianceSummary.references.map((ref) => (
                <li key={ref}>{ref}</li>
              ))}
            </ul>
            <table>
              <thead>
                <tr><th>Rule</th><th>Status</th><th>Note</th></tr>
              </thead>
              <tbody>
                {data.complianceSummary.checks.map((check) => (
                  <tr key={check.rule}><td>{check.rule}</td><td>{check.status}</td><td>{check.note}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </AppShell>
  );
}
