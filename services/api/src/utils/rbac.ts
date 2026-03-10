import type { FastifyReply, FastifyRequest } from "fastify";
import { getAuthContext } from "./auth.js";
import { getRequiredRoleForRoute, type AppRole } from "./route-role-policy.js";

const ROLE_HIERARCHY: Record<AppRole, number> = {
  viewer: 1,
  estimator: 2,
  admin: 3
};

function rbacEnabled(): boolean {
  return process.env.RBAC_ENFORCED === "true";
}

function normalizeRole(rawRole: string | undefined): AppRole | null {
  if (!rawRole) {
    return null;
  }
  const value = rawRole.trim().toLowerCase();
  if (value === "admin" || value === "estimator" || value === "viewer") {
    return value;
  }
  return null;
}

function isRoleAllowed(userRole: AppRole, requiredRole: AppRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export async function enforceRolePermissions(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  if (!rbacEnabled() || !request.url.startsWith("/api")) {
    return true;
  }

  const authContext = getAuthContext(request);
  const role = normalizeRole(authContext?.role);
  if (!role) {
    await reply.code(403).send({ message: "Role is required for this API operation." });
    return false;
  }

  const requiredRole = getRequiredRoleForRoute(request.method, request.url);
  if (!isRoleAllowed(role, requiredRole)) {
    await reply.code(403).send({
      message: "Insufficient permissions for this operation.",
      requiredRole
    });
    return false;
  }

  return true;
}
