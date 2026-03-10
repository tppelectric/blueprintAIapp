export type AppRole = "admin" | "estimator" | "viewer";

type RouteRoleRule = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  pattern: RegExp;
  requiredRole: AppRole;
};

const ROUTE_ROLE_RULES: RouteRoleRule[] = [
  { method: "POST", pattern: /^\/api\/projects$/, requiredRole: "estimator" },
  { method: "PUT", pattern: /^\/api\/projects\/[^/]+$/, requiredRole: "estimator" },
  { method: "PUT", pattern: /^\/api\/projects\/[^/]+\/id$/, requiredRole: "estimator" },
  { method: "DELETE", pattern: /^\/api\/projects\/[^/]+$/, requiredRole: "estimator" },
  { method: "POST", pattern: /^\/api\/projects\/[^/]+\/jobs$/, requiredRole: "estimator" },
  { method: "PUT", pattern: /^\/api\/projects\/[^/]+\/jobs\/[^/]+$/, requiredRole: "estimator" },
  { method: "PUT", pattern: /^\/api\/projects\/[^/]+\/jobs\/[^/]+\/id$/, requiredRole: "estimator" },
  { method: "DELETE", pattern: /^\/api\/projects\/[^/]+\/jobs\/[^/]+$/, requiredRole: "estimator" },
  { method: "POST", pattern: /^\/api\/projects\/[^/]+\/exports\/jobtread-sync$/, requiredRole: "admin" },
  { method: "POST", pattern: /^\/api\/projects\/[^/]+\/exports\/csv$/, requiredRole: "estimator" },
  { method: "POST", pattern: /^\/api\/imports\/plans$/, requiredRole: "estimator" },
  { method: "POST", pattern: /^\/api\/projects\/[^/]+\/rescan$/, requiredRole: "estimator" },
  { method: "POST", pattern: /^\/api\/projects\/[^/]+\/scan-jobs$/, requiredRole: "estimator" },
  { method: "POST", pattern: /^\/api\/projects\/[^/]+\/blueprint-processing$/, requiredRole: "estimator" },
  { method: "POST", pattern: /^\/api\/projects\/[^/]+\/symbol-review\/confirm$/, requiredRole: "estimator" },
  { method: "POST", pattern: /^\/api\/projects\/[^/]+\/estimate$/, requiredRole: "estimator" },
  { method: "POST", pattern: /^\/api\/projects\/[^/]+\/panel-schedule$/, requiredRole: "estimator" },
  { method: "POST", pattern: /^\/api\/projects\/[^/]+\/service-design$/, requiredRole: "estimator" },
  { method: "POST", pattern: /^\/api\/projects\/[^/]+\/material-list$/, requiredRole: "estimator" },
  { method: "POST", pattern: /^\/api\/projects\/[^/]+\/material-prices$/, requiredRole: "estimator" },
  { method: "PUT", pattern: /^\/api\/company\/settings$/, requiredRole: "admin" },
  { method: "POST", pattern: /^\/api\/company\/supplier-accounts$/, requiredRole: "admin" },
  { method: "POST", pattern: /^\/api\/platform\/estimate$/, requiredRole: "estimator" },
  { method: "POST", pattern: /^\/api\/platform\/load-calculator$/, requiredRole: "estimator" },
  { method: "POST", pattern: /^\/api\/platform\/load-calculator\/assign$/, requiredRole: "estimator" },
  { method: "POST", pattern: /^\/api\/platform\/wifi-analyzer$/, requiredRole: "estimator" },
  { method: "POST", pattern: /^\/api\/platform\/wifi-analyzer\/assign$/, requiredRole: "estimator" },
  { method: "POST", pattern: /^\/api\/platform\/utility-service$/, requiredRole: "estimator" },
  { method: "GET", pattern: /^\/api\/auth\/admin\/users$/, requiredRole: "admin" },
  { method: "POST", pattern: /^\/api\/auth\/admin\/invite-user$/, requiredRole: "admin" }
];

function normalizePath(url: string): string {
  const queryIndex = url.indexOf("?");
  return queryIndex >= 0 ? url.slice(0, queryIndex) : url;
}

export function getRequiredRoleForRoute(method: string, url: string): AppRole {
  const normalizedMethod = method.toUpperCase() as RouteRoleRule["method"];
  const path = normalizePath(url);

  for (const rule of ROUTE_ROLE_RULES) {
    if (rule.method === normalizedMethod && rule.pattern.test(path)) {
      return rule.requiredRole;
    }
  }

  return normalizedMethod === "GET" ? "viewer" : "estimator";
}
