"use client";

import type { CreateProjectInput, Project } from "@package/types";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";

const DEFAULT_PROJECT: CreateProjectInput = {
  projectName: "",
  projectAddress: "",
  city: "",
  state: "NY",
  clientName: "",
  projectType: "residential"
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState<CreateProjectInput>(DEFAULT_PROJECT);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectIdValue, setEditingProjectIdValue] = useState("");
  const [status, setStatus] = useState("Loading projects...");

  async function loadProjects() {
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const payload = (await response.json()) as { message?: string; projects?: Project[] };
      if (!response.ok || !payload.projects) {
        setStatus(payload.message ?? "Could not load projects.");
        return;
      }
      setProjects(payload.projects);
      setStatus("");
    } catch (error) {
      setStatus((error as Error).message || "Network error while loading projects.");
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  async function handleCreateProject() {
    if (
      !form.projectName.trim() ||
      !form.projectAddress.trim() ||
      !form.city.trim() ||
      !form.state.trim() ||
      !form.clientName.trim()
    ) {
      setStatus("Complete all project fields before creating the project.");
      return;
    }

    setStatus("Creating project...");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          projectName: form.projectName.trim(),
          projectAddress: form.projectAddress.trim(),
          city: form.city.trim(),
          state: form.state.trim().toUpperCase(),
          clientName: form.clientName.trim()
        })
      });
      const payload = (await response.json()) as { message?: string; project?: Project };
      if (!response.ok || !payload.project) {
        setStatus(payload.message ?? "Could not create project.");
        return;
      }
      setForm(DEFAULT_PROJECT);
      setStatus("Project created.");
      await loadProjects();
    } catch (error) {
      setStatus((error as Error).message || "Network error while creating project.");
    }
  }

  async function handleSaveProjectId(currentProjectId: string) {
    const nextProjectId = editingProjectIdValue.trim();
    if (!nextProjectId) {
      setStatus("Project ID cannot be blank.");
      return;
    }
    if (nextProjectId === currentProjectId) {
      setEditingProjectId(null);
      setEditingProjectIdValue("");
      return;
    }

    setStatus("Updating project ID...");
    try {
      const response = await fetch(`/api/projects/${currentProjectId}/id`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newId: nextProjectId })
      });
      const payload = (await response.json()) as { message?: string; projectId?: string };
      if (!response.ok || !payload.projectId) {
        setStatus(payload.message ?? "Could not update project ID.");
        return;
      }

      setEditingProjectId(null);
      setEditingProjectIdValue("");
      setStatus(`Project ID updated to ${payload.projectId}.`);
      await loadProjects();
    } catch (error) {
      setStatus((error as Error).message || "Network error while updating project ID.");
    }
  }

  return (
    <AppShell title="Projects">
      <section className="hero-panel">
        <div>
          <p className="section-kicker">Project pipeline</p>
          <h2>Launch and organize estimate-ready blueprint projects</h2>
          <p className="muted">Create a project first. Jobs are created inside each project and stay isolated under that project.</p>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hero-stat-label">Projects Loaded</span>
            <strong>{projects.length}</strong>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">Primary State</span>
            <strong>{form.state || "NY"}</strong>
          </div>
        </div>
      </section>

      <section className="card card-accent section-gap">
        <div className="section-heading">
          <div>
            <p className="section-kicker">New work</p>
            <h3>Create Project</h3>
          </div>
        </div>
        <div className="form-grid">
          <label className="field">
            Project Name
            <input value={form.projectName} onChange={(event) => setForm({ ...form, projectName: event.target.value })} />
          </label>
          <label className="field">
            Project Address
            <input
              value={form.projectAddress}
              onChange={(event) => setForm({ ...form, projectAddress: event.target.value })}
            />
          </label>
          <label className="field">
            City
            <input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
          </label>
          <label className="field">
            State
            <input value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value.toUpperCase() })} />
          </label>
          <label className="field">
            Client Name
            <input value={form.clientName} onChange={(event) => setForm({ ...form, clientName: event.target.value })} />
          </label>
          <label className="field">
            Project Type
            <select
              value={form.projectType}
              onChange={(event) =>
                setForm({
                  ...form,
                  projectType: event.target.value as CreateProjectInput["projectType"]
                })
              }
            >
              <option value="residential">Residential</option>
              <option value="multifamily">Multifamily</option>
              <option value="commercial">Commercial</option>
              <option value="industrial">Industrial</option>
            </select>
          </label>
          <div className="row actions">
            <button type="button" onClick={() => void handleCreateProject()}>
              Create Project
            </button>
          </div>
        </div>
      </section>

      <section className="card section-gap">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Workspace list</p>
            <h3>Project List</h3>
          </div>
          <span className="subtle-badge">Open, rename, and continue active work</span>
        </div>
        {status && <p className="status-text">{status}</p>}
        <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th>Project ID</th>
              <th>Name</th>
              <th>Client</th>
              <th>Location</th>
              <th>Type</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id}>
                <td>
                  {editingProjectId === project.id ? (
                    <input value={editingProjectIdValue} onChange={(event) => setEditingProjectIdValue(event.target.value)} />
                  ) : (
                    project.id
                  )}
                </td>
                <td>{project.name}</td>
                <td>{project.clientName ?? project.customerName}</td>
                <td>{project.location}</td>
                <td>{project.projectType ?? "residential"}</td>
                <td>
                  <div className="row">
                    <Link className="button-link secondary" href={`/projects/${project.id}`}>
                      Open Project
                    </Link>
                    {editingProjectId === project.id ? (
                      <>
                        <button type="button" onClick={() => void handleSaveProjectId(project.id)}>
                          Save ID
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => {
                            setEditingProjectId(null);
                            setEditingProjectIdValue("");
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setEditingProjectId(project.id);
                          setEditingProjectIdValue(project.id);
                        }}
                      >
                        Edit ID
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </AppShell>
  );
}
