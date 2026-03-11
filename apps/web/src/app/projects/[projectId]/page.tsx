"use client";

import type { CreateProjectJobInput, DashboardData, ProjectJob } from "@package/types";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../../components/app-shell";

const DEFAULT_JOB: CreateProjectJobInput = {
  jobName: "",
  jobType: "electrical_estimate",
  description: ""
};

type ProjectFormState = {
  projectName: string;
  projectAddress: string;
  city: string;
  state: string;
  clientName: string;
  projectType: "residential" | "multifamily" | "commercial" | "industrial";
};

const JOB_TYPE_LABELS: Record<CreateProjectJobInput["jobType"], string> = {
  electrical_estimate: "Electrical Estimate",
  low_voltage_estimate: "Low Voltage Estimate",
  lighting_upgrade: "Lighting Upgrade",
  service_upgrade: "Service Upgrade",
  other: "Other"
};

function formatActivityDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export default function ProjectDashboardPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [jobs, setJobs] = useState<ProjectJob[]>([]);
  const [form, setForm] = useState<CreateProjectJobInput>(DEFAULT_JOB);
  const [projectForm, setProjectForm] = useState<ProjectFormState>({
    projectName: "",
    projectAddress: "",
    city: "",
    state: "NY",
    clientName: "",
    projectType: "residential"
  });
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [projectIdInput, setProjectIdInput] = useState("");
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editingJobIdInput, setEditingJobIdInput] = useState("");
  const [editingJobForm, setEditingJobForm] = useState<CreateProjectJobInput>(DEFAULT_JOB);
  const [planFiles, setPlanFiles] = useState<File[]>([]);
  const [planScanMode, setPlanScanMode] = useState<"mock" | "real">("mock");
  const [uploadingPlans, setUploadingPlans] = useState(false);
  const [status, setStatus] = useState("Loading project dashboard...");

  async function loadProject() {
    try {
      const [dashboardResp, jobsResp] = await Promise.all([
        fetch(`/api/projects/${params.projectId}/dashboard`, { cache: "no-store" }),
        fetch(`/api/projects/${params.projectId}/jobs`, { cache: "no-store" })
      ]);

      const dashboardPayload = (await dashboardResp.json()) as { message?: string; dashboard?: DashboardData };
      const jobsPayload = (await jobsResp.json()) as { message?: string; jobs?: ProjectJob[] };

      if (!dashboardResp.ok || !dashboardPayload.dashboard) {
        setStatus(dashboardPayload.message ?? "Could not load project dashboard.");
        return;
      }
      if (jobsResp.ok && jobsPayload.jobs) {
        setJobs(jobsPayload.jobs);
      }

      setDashboard(dashboardPayload.dashboard);
      setProjectForm({
        projectName: dashboardPayload.dashboard.project.name,
        projectAddress: dashboardPayload.dashboard.project.projectAddress ?? "",
        city: dashboardPayload.dashboard.project.city ?? "",
        state: dashboardPayload.dashboard.project.state ?? "NY",
        clientName:
          dashboardPayload.dashboard.project.clientName ?? dashboardPayload.dashboard.project.customerName ?? "",
        projectType: dashboardPayload.dashboard.project.projectType ?? "residential"
      });
      setProjectIdInput(dashboardPayload.dashboard.project.id);
      setStatus("");
    } catch (error) {
      setStatus((error as Error).message || "Network error while loading project dashboard.");
    }
  }

  useEffect(() => {
    void loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.projectId]);

  async function handleCreateJob() {
    if (!form.jobName.trim() || !form.description.trim()) {
      setStatus("Enter a job name and description before creating a job.");
      return;
    }

    setStatus("Creating job...");
    try {
      const response = await fetch(`/api/projects/${params.projectId}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          jobName: form.jobName.trim(),
          description: form.description.trim()
        })
      });
      const payload = (await response.json()) as { message?: string; job?: ProjectJob };
      if (!response.ok || !payload.job) {
        setStatus(payload.message ?? "Could not create job.");
        return;
      }
      setForm(DEFAULT_JOB);
      setStatus("Job created.");
      await loadProject();
    } catch (error) {
      setStatus((error as Error).message || "Network error while creating job.");
    }
  }

  async function handleSaveProject() {
    if (
      !projectIdInput.trim() ||
      !projectForm.projectName.trim() ||
      !projectForm.projectAddress.trim() ||
      !projectForm.city.trim() ||
      !projectForm.state.trim() ||
      !projectForm.clientName.trim()
    ) {
      setStatus("Complete all project fields before saving.");
      return;
    }

    setStatus("Saving project changes...");
    try {
      let activeProjectId = params.projectId;
      if (projectIdInput.trim() && projectIdInput.trim() !== params.projectId) {
        const idResp = await fetch(`/api/projects/${params.projectId}/id`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newId: projectIdInput.trim() })
        });
        const idPayload = (await idResp.json()) as { message?: string; projectId?: string };
        if (!idResp.ok || !idPayload.projectId) {
          setStatus(idPayload.message ?? "Could not update project ID.");
          return;
        }
        activeProjectId = idPayload.projectId;
      }

      const response = await fetch(`/api/projects/${activeProjectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...projectForm,
          projectName: projectForm.projectName.trim(),
          projectAddress: projectForm.projectAddress.trim(),
          city: projectForm.city.trim(),
          state: projectForm.state.trim().toUpperCase(),
          clientName: projectForm.clientName.trim()
        })
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setStatus(payload.message ?? "Could not save project changes.");
        return;
      }
      setIsEditingProject(false);
      setStatus("Project updated.");
      if (activeProjectId !== params.projectId) {
        router.push(`/projects/${activeProjectId}`);
        router.refresh();
        return;
      }
      await loadProject();
    } catch (error) {
      setStatus((error as Error).message || "Network error while saving project changes.");
    }
  }

  async function handleDeleteProject() {
    const confirmed = window.confirm("Are you sure you want to delete this project?");
    if (!confirmed) {
      return;
    }

    setStatus("Deleting project...");
    try {
      const response = await fetch(`/api/projects/${params.projectId}`, { method: "DELETE" });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setStatus(payload.message ?? "Could not delete project.");
        return;
      }
      router.push("/projects");
      router.refresh();
    } catch (error) {
      setStatus((error as Error).message || "Network error while deleting project.");
    }
  }

  async function handleSaveJob(jobId: string) {
    if (!editingJobIdInput.trim() || !editingJobForm.jobName.trim() || !editingJobForm.description.trim()) {
      setStatus("Enter a job ID, job name, and description before saving.");
      return;
    }

    setStatus("Saving job changes...");
    try {
      let activeJobId = jobId;
      if (editingJobIdInput.trim() && editingJobIdInput.trim() !== jobId) {
        const idResp = await fetch(`/api/projects/${params.projectId}/jobs/${jobId}/id`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newId: editingJobIdInput.trim() })
        });
        const idPayload = (await idResp.json()) as { message?: string; jobId?: string };
        if (!idResp.ok || !idPayload.jobId) {
          setStatus(idPayload.message ?? "Could not update job ID.");
          return;
        }
        activeJobId = idPayload.jobId;
      }

      const response = await fetch(`/api/projects/${params.projectId}/jobs/${activeJobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editingJobForm,
          jobName: editingJobForm.jobName.trim(),
          description: editingJobForm.description.trim()
        })
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setStatus(payload.message ?? "Could not save job changes.");
        return;
      }
      setEditingJobId(null);
      setEditingJobIdInput("");
      setEditingJobForm(DEFAULT_JOB);
      setStatus("Job updated.");
      await loadProject();
    } catch (error) {
      setStatus((error as Error).message || "Network error while saving job changes.");
    }
  }

  async function handleDeleteJob(jobId: string) {
    const confirmed = window.confirm("Are you sure you want to delete this job?");
    if (!confirmed) {
      return;
    }

    setStatus("Deleting job...");
    try {
      const response = await fetch(`/api/projects/${params.projectId}/jobs/${jobId}`, { method: "DELETE" });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setStatus(payload.message ?? "Could not delete job.");
        return;
      }
      setStatus("Job deleted.");
      await loadProject();
    } catch (error) {
      setStatus((error as Error).message || "Network error while deleting job.");
    }
  }

  async function handleUploadPlans() {
    if (planFiles.length === 0) {
      setStatus("Attach at least one plan file before uploading.");
      return;
    }

    setUploadingPlans(true);
    setStatus("Uploading and scanning plans...");
    try {
      const formData = new FormData();
      formData.append("projectId", params.projectId);
      formData.append("source", "local");
      formData.append("scanMode", planScanMode);
      formData.append("fileName", planFiles[0].name);
      for (const file of planFiles) {
        formData.append("files", file);
      }

      const response = await fetch("/api/projects/imports/plans", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as {
        message?: string;
        importedFiles?: number;
        scanner?: {
          status?: string;
          mode?: string;
          scaleSummary?: Array<{ needsInput: boolean }>;
        };
      };
      if (!response.ok) {
        setStatus(payload.message ?? "Could not upload plans.");
        return;
      }

      const scaleNeedsInput = (payload.scanner?.scaleSummary ?? []).filter((item) => item.needsInput).length;
      const importedFiles = payload.importedFiles ?? planFiles.length;
      const scaleMessage =
        scaleNeedsInput > 0
          ? ` Scale was not detected on ${scaleNeedsInput} sheet(s).`
          : " Scale detected or provided for all processed sheets.";

      setPlanFiles([]);
      setStatus(`Uploaded ${importedFiles} plan file(s) in ${payload.scanner?.mode ?? planScanMode} mode.${scaleMessage}`);
      await loadProject();
    } catch (error) {
      setStatus((error as Error).message || "Network error while uploading plans.");
    } finally {
      setUploadingPlans(false);
    }
  }

  if (!dashboard) {
    return (
      <AppShell title="Project Dashboard">
        <section className="card">{status}</section>
      </AppShell>
    );
  }

  return (
    <AppShell title="Project Dashboard">
      <section className="hero-panel">
        <div>
          <p className="section-kicker">Project overview</p>
          <h2>{dashboard.project.name}</h2>
          <p className="muted">
            {dashboard.project.clientName ?? dashboard.project.customerName} |{" "}
            {dashboard.project.projectAddress ?? dashboard.project.location}
          </p>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hero-stat-label">Jobs</span>
            <strong>{jobs.length}</strong>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">Project ID</span>
            <strong>{dashboard.project.id}</strong>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">Type</span>
            <strong>{dashboard.project.projectType ?? "residential"}</strong>
          </div>
        </div>
      </section>

      <section className="project-layout section-gap">
        <section className="card card-accent">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p className="section-kicker">Settings</p>
              <h3>Project Controls</h3>
              <p className="muted">Update the project identity, address, customer, and scope type from one place.</p>
            </div>
            <div className="row">
              {!isEditingProject ? (
                <>
                  <button type="button" className="secondary" onClick={() => setIsEditingProject(true)}>
                    Edit Project
                  </button>
                  <button type="button" className="danger" onClick={() => void handleDeleteProject()}>
                    Delete Project
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => void handleSaveProject()}>
                    Save Changes
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setIsEditingProject(false);
                      setProjectForm({
                        projectName: dashboard.project.name,
                        projectAddress: dashboard.project.projectAddress ?? "",
                        city: dashboard.project.city ?? "",
                        state: dashboard.project.state ?? "NY",
                        clientName: dashboard.project.clientName ?? dashboard.project.customerName ?? "",
                        projectType: dashboard.project.projectType ?? "residential"
                      });
                    }}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>

          {isEditingProject ? (
            <div className="form-grid section-gap">
              <label className="field">
                Project ID
                <input value={projectIdInput} onChange={(event) => setProjectIdInput(event.target.value)} />
              </label>
              <label className="field">
                Project Name
                <input
                  value={projectForm.projectName}
                  onChange={(event) => setProjectForm({ ...projectForm, projectName: event.target.value })}
                />
              </label>
              <label className="field">
                Project Address
                <input
                  value={projectForm.projectAddress}
                  onChange={(event) => setProjectForm({ ...projectForm, projectAddress: event.target.value })}
                />
              </label>
              <label className="field">
                City
                <input value={projectForm.city} onChange={(event) => setProjectForm({ ...projectForm, city: event.target.value })} />
              </label>
              <label className="field">
                State
                <input
                  value={projectForm.state}
                  onChange={(event) => setProjectForm({ ...projectForm, state: event.target.value.toUpperCase() })}
                />
              </label>
              <label className="field">
                Client Name
                <input
                  value={projectForm.clientName}
                  onChange={(event) => setProjectForm({ ...projectForm, clientName: event.target.value })}
                />
              </label>
              <label className="field">
                Project Type
                <select
                  value={projectForm.projectType}
                  onChange={(event) =>
                    setProjectForm({
                      ...projectForm,
                      projectType: event.target.value as typeof projectForm.projectType
                    })
                  }
                >
                  <option value="residential">Residential</option>
                  <option value="multifamily">Multifamily</option>
                  <option value="commercial">Commercial</option>
                  <option value="industrial">Industrial</option>
                </select>
              </label>
            </div>
          ) : (
            <div className="entity-meta-grid section-gap">
              <div className="entity-meta-item">
                <span className="entity-meta-label">Client</span>
                <strong>{dashboard.project.clientName ?? dashboard.project.customerName ?? "Not set"}</strong>
              </div>
              <div className="entity-meta-item">
                <span className="entity-meta-label">State</span>
                <strong>{dashboard.project.state ?? "NY"}</strong>
              </div>
              <div className="entity-meta-item">
                <span className="entity-meta-label">Address</span>
                <strong>{dashboard.project.projectAddress ?? dashboard.project.location}</strong>
              </div>
              <div className="entity-meta-item">
                <span className="entity-meta-label">Scope</span>
                <strong>{dashboard.project.projectType ?? "residential"}</strong>
              </div>
            </div>
          )}

          <div className="row actions">
            <button type="button" onClick={() => void handleUploadPlans()} disabled={uploadingPlans}>
              {uploadingPlans ? "Uploading Plans..." : "Upload Plans"}
            </button>
            <Link className="button-link secondary" href={`/projects/${params.projectId}/import`}>
              Open Full Import Workspace
            </Link>
            <Link className="button-link secondary" href={`/projects/${params.projectId}/export`}>
              View Reports
            </Link>
          </div>

          <div className="form-grid section-gap">
            <label className="field">
              Attached Plans
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                multiple
                onChange={(event) => setPlanFiles(Array.from(event.target.files ?? []))}
              />
            </label>
            <label className="field">
              Scan Mode
              <select value={planScanMode} onChange={(event) => setPlanScanMode(event.target.value as "mock" | "real")}>
                <option value="mock">Mock (fast testing)</option>
                <option value="real">Real PDF/OCR</option>
              </select>
            </label>
          </div>
          {planFiles.length > 0 && (
            <p className="muted section-gap">
              Ready to upload: {planFiles.map((file) => file.name).join(", ")}
            </p>
          )}
        </section>

        <section className="card project-aside">
          <div>
            <p className="section-kicker">Workflow summary</p>
            <h3>How this project is organized</h3>
            <p className="muted">Keep one project for the overall jobsite. Create jobs under it for each estimating track or scope package.</p>
          </div>
          <div className="info-stack">
            <div className="info-chip">
              <span className="info-chip-label">Project ID</span>
              <strong>{dashboard.project.id}</strong>
            </div>
            <div className="info-chip">
              <span className="info-chip-label">Jobs inside this project</span>
              <strong>{jobs.length}</strong>
            </div>
            <div className="info-chip">
              <span className="info-chip-label">Recent activity</span>
              <strong>{dashboard.recentActivity?.length ?? 0} logged updates</strong>
            </div>
          </div>
        </section>
      </section>

      <section className="card section-gap">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Job setup</p>
            <h3>Create Job</h3>
            <p className="muted">Use a separate job for each estimate package so scans and reports stay isolated.</p>
          </div>
          <span className="subtle-badge">Jobs inherit this project context</span>
        </div>
        <div className="form-grid">
          <label className="field">
            Job Name
            <input value={form.jobName} onChange={(event) => setForm({ ...form, jobName: event.target.value })} />
          </label>
          <label className="field">
            Job Type
            <select
              value={form.jobType}
              onChange={(event) => setForm({ ...form, jobType: event.target.value as CreateProjectJobInput["jobType"] })}
            >
              <option value="electrical_estimate">Electrical Estimate</option>
              <option value="low_voltage_estimate">Low Voltage Estimate</option>
              <option value="lighting_upgrade">Lighting Upgrade</option>
              <option value="service_upgrade">Service Upgrade</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="field">
            Description
            <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </label>
          <div className="row actions">
            <button type="button" onClick={() => void handleCreateJob()}>
              Create Job
            </button>
          </div>
        </div>
      </section>

      <section id="jobs" className="card section-gap">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Active scopes</p>
            <h3>Jobs</h3>
          </div>
          <span className="subtle-badge">Each job keeps its own workspace context</span>
        </div>
        {jobs.length === 0 ? (
          <div className="empty-state">
            <h4>No jobs yet</h4>
            <p>Create a job above to open a dedicated workspace for scans, takeoffs, estimates, and reports.</p>
          </div>
        ) : (
          <div className="entity-grid">
            {jobs.map((job) => (
              <article key={job.id} className="entity-card">
                <div className="entity-card-top">
                  <div>
                    <p className="entity-eyebrow">Job Workspace</p>
                    {editingJobId === job.id ? (
                      <input
                        value={editingJobForm.jobName}
                        onChange={(event) => setEditingJobForm({ ...editingJobForm, jobName: event.target.value })}
                      />
                    ) : (
                      <h4>{job.name}</h4>
                    )}
                  </div>
                  <span className="subtle-badge">{JOB_TYPE_LABELS[job.type]}</span>
                </div>
                <div className="entity-meta-grid">
                  <div className="entity-meta-item">
                    <span className="entity-meta-label">Job ID</span>
                    {editingJobId === job.id ? (
                      <input value={editingJobIdInput} onChange={(event) => setEditingJobIdInput(event.target.value)} />
                    ) : (
                      <strong>{job.id}</strong>
                    )}
                  </div>
                  <div className="entity-meta-item">
                    <span className="entity-meta-label">Type</span>
                    {editingJobId === job.id ? (
                      <select
                        value={editingJobForm.jobType}
                        onChange={(event) =>
                          setEditingJobForm({
                            ...editingJobForm,
                            jobType: event.target.value as CreateProjectJobInput["jobType"]
                          })
                        }
                      >
                        <option value="electrical_estimate">Electrical Estimate</option>
                        <option value="low_voltage_estimate">Low Voltage Estimate</option>
                        <option value="lighting_upgrade">Lighting Upgrade</option>
                        <option value="service_upgrade">Service Upgrade</option>
                        <option value="other">Other</option>
                      </select>
                    ) : (
                      <strong>{JOB_TYPE_LABELS[job.type]}</strong>
                    )}
                  </div>
                  <div className="entity-meta-item entity-meta-item-wide">
                    <span className="entity-meta-label">Description</span>
                    {editingJobId === job.id ? (
                      <input
                        value={editingJobForm.description}
                        onChange={(event) => setEditingJobForm({ ...editingJobForm, description: event.target.value })}
                      />
                    ) : (
                      <strong>{job.description}</strong>
                    )}
                  </div>
                </div>
                <div className="row actions">
                  {editingJobId === job.id ? (
                    <>
                      <button type="button" onClick={() => void handleSaveJob(job.id)}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setEditingJobId(null);
                          setEditingJobIdInput("");
                          setEditingJobForm(DEFAULT_JOB);
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <Link className="button-link" href={`/projects/${params.projectId}/jobs/${job.id}`}>
                        Open Workspace
                      </Link>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setEditingJobId(job.id);
                          setEditingJobIdInput(job.id);
                          setEditingJobForm({
                            jobName: job.name,
                            jobType: job.type,
                            description: job.description
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button type="button" className="danger" onClick={() => void handleDeleteJob(job.id)}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card section-gap">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Recent changes</p>
            <h3>Recent Activity</h3>
          </div>
        </div>
        {(dashboard.recentActivity ?? []).length === 0 ? (
          <div className="empty-state">
            <h4>No recent activity</h4>
            <p>Project changes will show up here after scans, edits, or report exports are completed.</p>
          </div>
        ) : (
          <div className="activity-list">
            {(dashboard.recentActivity ?? []).map((activity) => (
              <article key={activity.id} className="activity-item">
                <div>
                  <p className="entity-eyebrow">Project update</p>
                  <h4>{activity.label}</h4>
                </div>
                <span className="subtle-badge">{formatActivityDate(activity.createdAt)}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card section-gap">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Uploaded plans</p>
            <h3>Project Plan Register</h3>
          </div>
          <span className="subtle-badge">{dashboard.sheets.length} sheet(s)</span>
        </div>
        {dashboard.sheets.length === 0 ? (
          <div className="empty-state">
            <h4>No plans uploaded</h4>
            <p>Upload plans from Project Controls to build this project&apos;s sheet list and reporting data.</p>
          </div>
        ) : (
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Sheet</th>
                  <th>Title</th>
                  <th>Source File</th>
                  <th>Page</th>
                  <th>Scale</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.sheets.map((sheet) => (
                  <tr key={sheet.id}>
                    <td>{sheet.sheetNumber}</td>
                    <td>{sheet.title}</td>
                    <td>{sheet.fileName}</td>
                    <td>{sheet.pageNumber}</td>
                    <td>{sheet.scale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
