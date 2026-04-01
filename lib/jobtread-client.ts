/**
 * JobTread Pave API client (READ-ONLY). POST https://api.jobtread.com/pave
 *
 * If upserts fail in sync, ensure columns exist — see `supabase/jobtread_integration_columns.sql`.
 */

export type JobtreadCustomer = {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  primaryContact?: {
    id: string;
    name: string;
  } | null;
};

export type JobtreadJob = {
  id: string;
  name: string;
  number: string | null;
  createdAt: string;
  status?: string | null;
  location?: {
    id: string;
    name: string;
    address?: string;
  } | null;
};

function unwrapPaveRoot(data: Record<string, unknown>): Record<string, unknown> {
  const inner = data.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return data;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

function strOrNull(v: unknown): string | null {
  const s = str(v).trim();
  return s ? s : null;
}

/**
 * Low-level Pave POST. `query` is merged next to `$: { grantKey }`.
 */
export async function jobtreadQuery(
  grantKey: string,
  query: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    const response = await fetch("https://api.jobtread.com/pave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: { $: { grantKey }, ...query } }),
    });
    if (!response.ok) {
      let detail = "";
      try {
        const errBody = await response.text();
        if (errBody) detail = `: ${errBody.slice(0, 800)}`;
      } catch {
        /* ignore */
      }
      throw new Error(
        `JobTread API error: ${response.status} ${response.statusText}${detail}`,
      );
    }
    const data = (await response.json()) as Record<string, unknown>;
    if (data.errors) {
      throw new Error(`JobTread query error: ${JSON.stringify(data.errors)}`);
    }
    return data;
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error(`JobTread request failed: ${String(e)}`);
  }
}

export async function fetchJobtreadOrganization(
  grantKey: string,
  orgId: string,
): Promise<{ id: string; name: string } | null> {
  try {
    const raw = await jobtreadQuery(grantKey, {
      organization: {
        $: { id: orgId },
        id: {},
        name: {},
      },
    });
    const root = unwrapPaveRoot(raw);
    const org = asRecord(root.organization);
    if (!org) return null;
    const id = str(org.id) || orgId;
    const name = str(org.name);
    if (!name && !id) return null;
    return { id, name: name || "Organization" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`fetchJobtreadOrganization failed: ${msg}`);
  }
}

function parseCustomerNode(n: Record<string, unknown>): JobtreadCustomer {
  const pcRaw = n.primaryContact;
  const pc = asRecord(pcRaw);
  return {
    id: str(n.id),
    name: str(n.name),
    type: str(n.type),
    createdAt: str(n.createdAt),
    primaryContact: pc
      ? {
          id: str(pc.id),
          name: str(pc.name),
        }
      : null,
  };
}

/**
 * One page of customer accounts (type = customer). Pass `page` from previous `nextPage` to continue.
 */
export async function fetchJobtreadCustomers(
  grantKey: string,
  orgId: string,
  page?: string,
): Promise<{ nodes: JobtreadCustomer[]; nextPage: string | null }> {
  try {
    const accountsArgs: Record<string, unknown> = {
      size: 100,
      where: {
        and: [["type", "=", "customer"]],
      },
      ...(page ? { page } : {}),
    };

    const raw = await jobtreadQuery(grantKey, {
      organization: {
        $: { id: orgId },
        id: {},
        accounts: {
          $: accountsArgs,
          nextPage: {},
          nodes: {
            id: {},
            name: {},
            type: {},
            createdAt: {},
            primaryContact: {
              id: {},
              name: {},
            },
          },
        },
      },
    });
    const root = unwrapPaveRoot(raw);
    const org = asRecord(root.organization);
    const accounts = org ? asRecord(org.accounts) : null;
    const nodesRaw = accounts?.nodes;
    const next = accounts?.nextPage;

    const nodes: JobtreadCustomer[] = [];
    if (Array.isArray(nodesRaw)) {
      for (const item of nodesRaw) {
        const rec = asRecord(item);
        if (rec && str(rec.id)) nodes.push(parseCustomerNode(rec));
      }
    }

    const nextPage =
      next == null || next === ""
        ? null
        : typeof next === "string"
          ? next
          : str(next);

    return { nodes, nextPage };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`fetchJobtreadCustomers failed: ${msg}`);
  }
}

let jtStatusDebugLogsRemaining = 5;

function parseJobNode(n: Record<string, unknown>): JobtreadJob {
  const loc = asRecord(n.location);
  const status = strOrNull(n.status);
  if (jtStatusDebugLogsRemaining > 0) {
    jtStatusDebugLogsRemaining -= 1;
    console.log("[JT status debug]", n.id, n.status, Object.keys(n));
  }
  return {
    id: str(n.id),
    name: str(n.name),
    number: strOrNull(n.number),
    createdAt: str(n.createdAt),
    status,
    location: loc
      ? {
          id: str(loc.id),
          name: str(loc.name),
          address: loc.address != null ? str(loc.address) : undefined,
        }
      : null,
  };
}

/**
 * One page of jobs for the organization. Pass `page` from previous `nextPage` to continue.
 * `options.size` defaults to 100 when omitted.
 */
export async function fetchJobtreadJobs(
  grantKey: string,
  orgId: string,
  page?: string,
  options?: { size?: number },
): Promise<{ nodes: JobtreadJob[]; nextPage: string | null }> {
  try {
    const jobsArgs: Record<string, unknown> = {
      size: options?.size ?? 100,
      ...(page ? { page } : {}),
    };

    const raw = await jobtreadQuery(grantKey, {
      organization: {
        $: { id: orgId },
        id: {},
        jobs: {
          $: jobsArgs,
          nextPage: {},
          nodes: {
            id: {},
            name: {},
            number: {},
            createdAt: {},
            status: {},
            location: {
              id: {},
              name: {},
              address: {},
            },
          },
        },
      },
    });
    const root = unwrapPaveRoot(raw);
    const org = asRecord(root.organization);
    const jobs = org ? asRecord(org.jobs) : null;
    const nodesRaw = jobs?.nodes;
    const next = jobs?.nextPage;

    const nodes: JobtreadJob[] = [];
    if (Array.isArray(nodesRaw)) {
      for (const item of nodesRaw) {
        const rec = asRecord(item);
        if (rec && str(rec.id)) nodes.push(parseJobNode(rec));
      }
    }

    const nextPage =
      next == null || next === ""
        ? null
        : typeof next === "string"
          ? next
          : str(next);

    return { nodes, nextPage };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`fetchJobtreadJobs failed: ${msg}`);
  }
}

/** First page only (size 5). Parsed jobs including `status` — not used by sync. */
export async function debugJobTreadStatus(
  grantKey: string,
  orgId: string,
): Promise<JobtreadJob[]> {
  const { nodes } = await fetchJobtreadJobs(grantKey, orgId, undefined, {
    size: 5,
  });
  return nodes;
}

export type JobtreadLocationNode = {
  id: string;
  accountId: string | null;
};

export async function fetchJobtreadLocationAccountMap(
  grantKey: string,
  orgId: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let page: string | undefined = undefined;

  for (;;) {
    const locArgs: Record<string, unknown> = {
      size: 100,
      ...(page ? { page } : {}),
    };

    const raw = await jobtreadQuery(grantKey, {
      organization: {
        $: { id: orgId },
        id: {},
        locations: {
          $: locArgs,
          nextPage: {},
          nodes: {
            id: {},
            account: {
              id: {},
            },
          },
        },
      },
    });

    const root = unwrapPaveRoot(raw);
    const org = asRecord(root.organization);
    const locs = org ? asRecord(org.locations) : null;
    const nodesRaw = locs?.nodes;
    const next = locs?.nextPage;

    if (Array.isArray(nodesRaw)) {
      for (const item of nodesRaw) {
        const rec = asRecord(item);
        if (!rec) continue;
        const locId = str(rec.id);
        const acct = asRecord(rec.account);
        const acctId = acct ? str(acct.id) : null;
        if (locId && acctId) {
          map.set(locId, acctId);
        }
      }
    }

    const nextPage =
      next == null || next === ""
        ? null
        : typeof next === "string"
          ? next
          : str(next);

    if (!nextPage) break;
    page = nextPage;
  }

  return map;
}
