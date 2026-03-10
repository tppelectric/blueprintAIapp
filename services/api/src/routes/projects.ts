import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  createProjectJob,
  deleteProjectJob,
  listProjectJobs,
  renameJobIdForProject,
  updateProjectJob
} from "../repositories/job-repository.js";
import {
  createProjectForCompany,
  deleteProjectForCompany,
  getDashboardForProject,
  listProjectsForCompany,
  renameProjectIdForCompany,
  updateProjectForCompany
} from "../repositories/project-repository.js";
import { resolveCompanyId } from "../utils/tenant.js";

const createProjectSchema = z.object({
  projectName: z.string().min(1),
  projectAddress: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(2).max(2),
  clientName: z.string().min(1),
  projectType: z.enum(["residential", "multifamily", "commercial", "industrial"])
});

const createJobSchema = z.object({
  jobName: z.string().min(1),
  jobType: z.enum(["electrical_estimate", "low_voltage_estimate", "lighting_upgrade", "service_upgrade", "other"]),
  description: z.string().min(1)
});

const renameIdSchema = z.object({
  newId: z.string().min(1)
});

export const projectRoutes: FastifyPluginAsync = async (app) => {
  app.post("/projects", async (request, reply) => {
    const companyId = resolveCompanyId(request);
    const parsed = createProjectSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid project payload", issues: parsed.error.flatten() });
    }

    try {
      const project = await createProjectForCompany(companyId, parsed.data);
      return { companyId, project };
    } catch (error) {
      return reply.code(502).send({ message: "Could not create project", detail: (error as Error).message });
    }
  });

  app.get("/projects", async (request, reply) => {
    const companyId = resolveCompanyId(request);

    try {
      const projects = await listProjectsForCompany(companyId);
      return { companyId, projects };
    } catch (error) {
      return reply.code(502).send({ message: "Could not load projects", detail: (error as Error).message });
    }
  });

  app.get("/projects/:projectId/dashboard", async (request, reply) => {
    const params = request.params as { projectId: string };
    const query = request.query as { jobId?: string };
    const companyId = resolveCompanyId(request);

    try {
      const dashboard = await getDashboardForProject(companyId, params.projectId, query.jobId);
      if (dashboard) {
        return { companyId, dashboard };
      }
      return reply.code(404).send({ message: "Project dashboard not found for company scope" });
    } catch (error) {
      return reply.code(502).send({ message: "Could not load project dashboard", detail: (error as Error).message });
    }
  });

  app.put("/projects/:projectId", async (request, reply) => {
    const params = request.params as { projectId: string };
    const companyId = resolveCompanyId(request);
    const parsed = createProjectSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid project payload", issues: parsed.error.flatten() });
    }

    try {
      const project = await updateProjectForCompany({ companyId, projectId: params.projectId, input: parsed.data });
      if (!project) {
        return reply.code(404).send({ message: "Project not found for company scope" });
      }
      return { companyId, project };
    } catch (error) {
      return reply.code(502).send({ message: "Could not update project", detail: (error as Error).message });
    }
  });

  app.delete("/projects/:projectId", async (request, reply) => {
    const params = request.params as { projectId: string };
    const companyId = resolveCompanyId(request);

    try {
      const deleted = await deleteProjectForCompany({ companyId, projectId: params.projectId });
      if (!deleted) {
        return reply.code(404).send({ message: "Project not found for company scope" });
      }
      return { companyId, projectId: params.projectId, deleted: true };
    } catch (error) {
      return reply.code(502).send({ message: "Could not delete project", detail: (error as Error).message });
    }
  });

  app.put("/projects/:projectId/id", async (request, reply) => {
    const params = request.params as { projectId: string };
    const companyId = resolveCompanyId(request);
    const parsed = renameIdSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid project ID payload", issues: parsed.error.flatten() });
    }

    try {
      const renamed = await renameProjectIdForCompany({
        companyId,
        currentProjectId: params.projectId,
        newProjectId: parsed.data.newId
      });
      if (!renamed) {
        return reply.code(404).send({ message: "Project not found for company scope" });
      }
      return { companyId, previousProjectId: params.projectId, projectId: parsed.data.newId, renamed: true };
    } catch (error) {
      return reply.code(502).send({ message: "Could not rename project ID", detail: (error as Error).message });
    }
  });

  app.get("/projects/:projectId/jobs", async (request, reply) => {
    const params = request.params as { projectId: string };
    const companyId = resolveCompanyId(request);

    try {
      const jobs = await listProjectJobs({ companyId, projectId: params.projectId });
      return { companyId, projectId: params.projectId, jobs };
    } catch (error) {
      return reply.code(502).send({ message: "Could not load jobs", detail: (error as Error).message });
    }
  });

  app.post("/projects/:projectId/jobs", async (request, reply) => {
    const params = request.params as { projectId: string };
    const companyId = resolveCompanyId(request);
    const parsed = createJobSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid job payload", issues: parsed.error.flatten() });
    }

    try {
      const job = await createProjectJob({
        companyId,
        projectId: params.projectId,
        input: parsed.data
      });

      return { companyId, projectId: params.projectId, job };
    } catch (error) {
      return reply.code(502).send({ message: "Could not create job", detail: (error as Error).message });
    }
  });

  app.put("/projects/:projectId/jobs/:jobId", async (request, reply) => {
    const params = request.params as { projectId: string; jobId: string };
    const companyId = resolveCompanyId(request);
    const parsed = createJobSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid job payload", issues: parsed.error.flatten() });
    }

    try {
      const job = await updateProjectJob({
        companyId,
        projectId: params.projectId,
        jobId: params.jobId,
        input: parsed.data
      });

      if (!job) {
        return reply.code(404).send({ message: "Job not found for company scope" });
      }

      return { companyId, projectId: params.projectId, job };
    } catch (error) {
      return reply.code(502).send({ message: "Could not update job", detail: (error as Error).message });
    }
  });

  app.delete("/projects/:projectId/jobs/:jobId", async (request, reply) => {
    const params = request.params as { projectId: string; jobId: string };
    const companyId = resolveCompanyId(request);

    try {
      const deleted = await deleteProjectJob({
        companyId,
        projectId: params.projectId,
        jobId: params.jobId
      });

      if (!deleted) {
        return reply.code(404).send({ message: "Job not found for company scope" });
      }
      return { companyId, projectId: params.projectId, jobId: params.jobId, deleted: true };
    } catch (error) {
      return reply.code(502).send({ message: "Could not delete job", detail: (error as Error).message });
    }
  });

  app.put("/projects/:projectId/jobs/:jobId/id", async (request, reply) => {
    const params = request.params as { projectId: string; jobId: string };
    const companyId = resolveCompanyId(request);
    const parsed = renameIdSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid job ID payload", issues: parsed.error.flatten() });
    }

    try {
      const renamed = await renameJobIdForProject({
        companyId,
        projectId: params.projectId,
        currentJobId: params.jobId,
        newJobId: parsed.data.newId
      });
      if (!renamed) {
        return reply.code(404).send({ message: "Job not found for company scope" });
      }
      return { companyId, projectId: params.projectId, previousJobId: params.jobId, jobId: parsed.data.newId, renamed: true };
    } catch (error) {
      return reply.code(502).send({ message: "Could not rename job ID", detail: (error as Error).message });
    }
  });

  app.get("/projects/:projectId/jobs/:jobId/workspace", async (request, reply) => {
    const params = request.params as { projectId: string; jobId: string };
    const companyId = resolveCompanyId(request);

    try {
      const dashboard = await getDashboardForProject(companyId, params.projectId, params.jobId);
      if (!dashboard) {
        return reply.code(404).send({ message: "Job workspace not found for company scope" });
      }
      return { companyId, projectId: params.projectId, jobId: params.jobId, workspace: dashboard };
    } catch (error) {
      return reply.code(502).send({ message: "Could not load job workspace", detail: (error as Error).message });
    }
  });
};

