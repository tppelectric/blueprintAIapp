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

  if (!dashboard) {
    return (
      <AppShell title="Project Dashboard">
        <section className="card">{status}</section>
      </AppShell>
    );
  }

  return (
    <AppShell title="Project Dashboard">
      <section className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h3>{dashboard.project.name}</h3>
            <p className="muted">
              {dashboard.project.clientName ?? dashboard.project.customerName} |{" "}
              {dashboard.project.projectAddress ?? dashboard.project.location}
            </p>
            <p className="muted">Project ID: {dashboard.project.id}</p>
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

        {isEditingProject && (
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
        )}

        <div className="row actions">
          <Link className="button-link" href={`/projects/${params.projectId}/import`}>
            Upload Plans
          </Link>
          <Link className="button-link secondary" href={`/projects/${params.projectId}/export`}>
            View Reports
          </Link>
        </div>
      </section>

      <section className="card section-gap">
        <h3>Create Job</h3>
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
        <h3>Jobs</h3>
        <table>
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Name</th>
              <th>Type</th>
              <th>Description</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr>
                <td colSpan={5}>No jobs yet.</td>
              </tr>
            )}
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>
                  {editingJobId === job.id ? (
                    <input value={editingJobIdInput} onChange={(event) => setEditingJobIdInput(event.target.value)} />
                  ) : (
                    job.id
                  )}
                </td>
                <td>
                  {editingJobId === job.id ? (
                    <input
                      value={editingJobForm.jobName}
                      onChange={(event) => setEditingJobForm({ ...editingJobForm, jobName: event.target.value })}
                    />
                  ) : (
                    job.name
                  )}
                </td>
                <td>
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
                    job.type
                  )}
                </td>
                <td>
                  {editingJobId === job.id ? (
                    <input
                      value={editingJobForm.description}
                      onChange={(event) => setEditingJobForm({ ...editingJobForm, description: event.target.value })}
                    />
                  ) : (
                    job.description
                  )}
                </td>
                <td>
                  <div className="row">
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
                        <Link className="button-link secondary" href={`/projects/${params.projectId}/jobs/${job.id}`}>
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card section-gap">
        <h3>Recent Activity</h3>
        <table>
          <thead>
            <tr>
              <th>Activity</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {(dashboard.recentActivity ?? []).length === 0 && (
              <tr>
                <td colSpan={2}>No recent activity.</td>
              </tr>
            )}
            {(dashboard.recentActivity ?? []).map((activity) => (
              <tr key={activity.id}>
                <td>{activity.label}</td>
                <td>{activity.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
