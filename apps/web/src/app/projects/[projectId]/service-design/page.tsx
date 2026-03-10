"use client";

import type { ProjectServiceDesignRecord, UtilityProvider } from "@package/types";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../../../components/app-shell";

type Payload = {
  serviceDesign: ProjectServiceDesignRecord;
};

export default function ProjectServiceDesignPage() {
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  const [status, setStatus] = useState("Loading service design...");
  const [data, setData] = useState<Payload | null>(null);
  const [provider, setProvider] = useState<UtilityProvider>("central_hudson");
  const [serviceAmps, setServiceAmps] = useState(200);
  const [continuousLoadAmps, setContinuousLoadAmps] = useState(0);
  const [installationType, setInstallationType] = useState<"overhead" | "underground">("underground");

  useEffect(() => {
    void loadLatest();
  }, [jobId, params.projectId]);

  async function loadLatest() {
    const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
    const response = await fetch(`/api/projects/${params.projectId}/service-design${query}`, {
      cache: "no-store"
    });
    const payload = (await response.json()) as Partial<Payload> & { message?: string };

    if (!response.ok || !payload.serviceDesign) {
      setData(null);
      setStatus(payload.message ?? "No saved service design yet.");
      return;
    }

    setData({ serviceDesign: payload.serviceDesign });
    setStatus("");
  }

  async function generateDesign() {
    setStatus("Generating utility service design...");
    const response = await fetch(`/api/projects/${params.projectId}/service-design`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        jobId,
        serviceAmps,
        continuousLoadAmps: continuousLoadAmps > 0 ? continuousLoadAmps : undefined,
        installationType
      })
    });
    const payload = (await response.json()) as Partial<Payload> & { message?: string };

    if (!response.ok || !payload.serviceDesign) {
      setStatus(payload.message ?? "Could not generate service design.");
      return;
    }

    setData({ serviceDesign: payload.serviceDesign });
    setStatus("Service design generated and saved.");
  }

  return (
    <AppShell title="Project Service Design">
      <section className="card">
        <h3>Design Inputs</h3>
        <p className="muted">
          Uses NEC-based service size recommendation and utility profile rules, including your Central Hudson CT override for continuous load over 320A.
        </p>
        <div className="form-grid">
          <label className="field">
            Utility
            <select value={provider} onChange={(event) => setProvider(event.target.value as UtilityProvider)}>
              <option value="central_hudson">Central Hudson</option>
              <option value="nyseg">NYSEG</option>
            </select>
          </label>
          <label className="field">
            Service Amps
            <input type="number" value={serviceAmps} onChange={(event) => setServiceAmps(Number(event.target.value))} />
          </label>
          <label className="field">
            Continuous Load Amps (optional)
            <input type="number" value={continuousLoadAmps} onChange={(event) => setContinuousLoadAmps(Number(event.target.value))} />
          </label>
          <label className="field">
            Installation Type
            <select value={installationType} onChange={(event) => setInstallationType(event.target.value as "overhead" | "underground")}>
              <option value="underground">Underground</option>
              <option value="overhead">Overhead</option>
            </select>
          </label>
          <div className="row actions">
            <button type="button" onClick={generateDesign}>
              Generate Service Design
            </button>
          </div>
        </div>
      </section>

      {status && <section className="card section-gap"><p className="status-text">{status}</p></section>}

      {data && (
        <section className="card section-gap">
          <h3>Latest Service Design</h3>
          <table>
            <tbody>
              <tr><td>Design ID</td><td>{data.serviceDesign.designId}</td></tr>
              <tr><td>Created</td><td>{new Date(data.serviceDesign.createdAt).toLocaleString()}</td></tr>
              <tr><td>Provider</td><td>{data.serviceDesign.provider}</td></tr>
              <tr><td>Service Amps</td><td>{data.serviceDesign.serviceAmps}</td></tr>
              <tr><td>Continuous Load Amps</td><td>{data.serviceDesign.continuousLoadAmps ?? "-"}</td></tr>
              <tr><td>Service Size</td><td>{data.serviceDesign.serviceSize}</td></tr>
              <tr><td>Meter Socket</td><td>{data.serviceDesign.design.recommendedMeterSocket}</td></tr>
              <tr><td>CT Cabinet Required</td><td>{data.serviceDesign.design.ctCabinetRequired ? "Yes" : "No"}</td></tr>
              <tr><td>Service Conductors</td><td>{data.serviceDesign.design.serviceConductors}</td></tr>
              <tr><td>Transformer Requirement</td><td>{data.serviceDesign.design.transformerRequirement}</td></tr>
              <tr><td>Installation Type</td><td>{data.serviceDesign.design.installationType}</td></tr>
            </tbody>
          </table>
        </section>
      )}
    </AppShell>
  );
}
