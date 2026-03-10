import type { FastifyRequest } from "fastify";
import { getAuthContext } from "./auth.js";

export function getPrimaryCompanyId(): string {
  return process.env.PRIMARY_COMPANY_ID ?? "company-primary";
}

export function getTenancyMode(): "single_company" | "multi_company" {
  return (process.env.APP_TENANCY_MODE as "single_company" | "multi_company") ?? "single_company";
}

function allowDevTenantHeader(): boolean {
  return process.env.ALLOW_DEV_TENANT_HEADER === "true";
}

export function resolveCompanyId(request: FastifyRequest): string {
  const authContext = getAuthContext(request);
  if (authContext?.companyId) {
    return authContext.companyId;
  }

  if (allowDevTenantHeader()) {
    const headerValue = request.headers["x-company-id"];
    const headerCompany = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (headerCompany && headerCompany.trim().length > 0) {
      return headerCompany.trim();
    }
  }

  return getPrimaryCompanyId();
}
