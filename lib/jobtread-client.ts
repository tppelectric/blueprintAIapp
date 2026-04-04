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
    email?: string | null;
    phone?: string | null;
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
  account?: {
    id: string;
    name?: string | null;
  } | null;
  job_status_custom: string | null;
  need_ready_to_invoice: string | null;
};

export type JobtreadDailyLogCustomFieldValueNode = {
  id: string;
  value: string | null;
  customField: { id: string; name: string };
};

/**
 * Daily log after parsing Pave `customFieldValues` into app fields.
 * Raw API nodes include `customFieldValues: { nodes: [...] }` before parsing.
 */
export type JobtreadDailyLog = {
  id: string;
  date: string;
  notes: string | null;
  createdAt: string;
  job: { id: string; name: string; number: string | null };
  job_status: string | null;
  employees_onsite: string | null;
  trades_onsite: string | null;
  visitors_onsite: string | null;
  materials_used: string | null;
  materials_left_onsite: boolean;
  anticipated_delays: string | null;
  equipment_left_onsite: string | null;
  tpp_equipment_left: boolean;
  additional_notes: string | null;
  work_completed: string | null;
};

const JT_CF_EQUIPMENT_LEFT = 'Equipment Left On Site: (or write "NONE")';

function customFieldMapFromNode(n: Record<string, unknown>): Map<string, string> {
  const m = new Map<string, string>();
  const wrap = asRecord(n.customFieldValues);
  const nodesRaw = wrap?.nodes;
  if (!Array.isArray(nodesRaw)) return m;
  for (const item of nodesRaw) {
    const rec = asRecord(item);
    if (!rec) continue;
    const cf = asRecord(rec.customField);
    const name = cf ? str(cf.name).trim() : "";
    const val = rec.value != null ? str(rec.value) : "";
    if (name) m.set(name, val);
  }
  return m;
}

function parseCustomFieldBool(v: string | undefined): boolean {
  if (v == null || !v.trim()) return false;
  const s = v.trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(s)) return true;
  if (["no", "n", "false", "0", "none"].includes(s)) return false;
  return false;
}

/** Map Pave daily log node; maps named custom fields into typed columns. */
export function parseDailyLogNode(n: Record<string, unknown>): JobtreadDailyLog {
  const jobRec = asRecord(n.job);
  const job = jobRec
    ? {
        id: str(jobRec.id),
        name: str(jobRec.name),
        number: strOrNull(jobRec.number),
      }
    : { id: "", name: "", number: null };

  const byName = customFieldMapFromNode(n);

  const get = (exact: string) => {
    const v = byName.get(exact);
    return v != null && String(v).trim() ? String(v).trim() : null;
  };

  let work_completed: string | null = null;
  for (const [k, v] of byName) {
    if (k.toLowerCase().includes("please use notes section")) {
      const t = v != null ? String(v).trim() : "";
      work_completed = t ? t : null;
      break;
    }
  }

  return {
    id: str(n.id),
    date: normalizeDailyLogDate(str(n.date)),
    notes: strOrNull(n.notes),
    createdAt: str(n.createdAt),
    job,
    job_status: get("Job Status"),
    employees_onsite: get("TPP Employees On-Site"),
    trades_onsite: get("Trades Onsite"),
    visitors_onsite: get("Visitors Onsite"),
    materials_used: get("Materials Used"),
    materials_left_onsite: parseCustomFieldBool(
      byName.get("Any TPP Materials Left On Site?") ?? undefined,
    ),
    anticipated_delays: get("Anticipated Delays"),
    tpp_equipment_left: parseCustomFieldBool(
      byName.get("Any TPP Equipment Left On Site?") ?? undefined,
    ),
    equipment_left_onsite:
      get(JT_CF_EQUIPMENT_LEFT) ??
      (() => {
        for (const [k, v] of byName) {
          if (k.startsWith("Equipment Left On Site")) {
            const t = v != null ? String(v).trim() : "";
            return t ? t : null;
          }
        }
        return null;
      })(),
    additional_notes: get("General Notes/Additional Materials Needed:"),
    work_completed,
  };
}

function normalizeDailyLogDate(raw: string): string {
  const t = raw.trim();
  if (!t) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return t.slice(0, 10);
}

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

function parseJobNode(n: Record<string, unknown>): JobtreadJob {
  const loc = asRecord(n.location);
  const byName = customFieldMapFromNode(n);
  return {
    id: str(n.id),
    name: str(n.name),
    number: strOrNull(n.number),
    createdAt: str(n.createdAt),
    status: strOrNull(n.status),
    location: loc
      ? {
          id: str(loc.id),
          name: str(loc.name),
          address: loc.address != null ? str(loc.address) : undefined,
        }
      : null,
    job_status_custom: byName.get("STATUS OF JOB") ?? null,
    need_ready_to_invoice: byName.get("NEED/READY TO INVOICE") ?? null,
  };
}

/**
 * One page of jobs for the organization. Pass `page` from previous `nextPage` to continue.
 */
export async function fetchJobtreadJobs(
  grantKey: string,
  orgId: string,
  page?: string,
): Promise<{ nodes: JobtreadJob[]; nextPage: string | null }> {
  try {
    const jobsArgs: Record<string, unknown> = {
      size: 25,
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
            customFieldValues: {
              nodes: {
                id: {},
                value: {},
                customField: {
                  id: {},
                  name: {},
                },
              },
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

/**
 * One page of organization daily logs. Pass `page` from previous `nextPage` to continue.
 */
export async function fetchJobtreadDailyLogs(
  grantKey: string,
  orgId: string,
  page?: string,
): Promise<{ nodes: JobtreadDailyLog[]; nextPage: string | null }> {
  try {
    const args: Record<string, unknown> = {
      size: 25,
      ...(page ? { page } : {}),
    };

    const raw = await jobtreadQuery(grantKey, {
      organization: {
        $: { id: orgId },
        id: {},
        dailyLogs: {
          $: args,
          nextPage: {},
          nodes: {
            id: {},
            date: {},
            notes: {},
            createdAt: {},
            job: {
              id: {},
              name: {},
              number: {},
            },
            customFieldValues: {
              nextPage: {},
              nodes: {
                id: {},
                value: {},
                customField: {
                  id: {},
                  name: {},
                },
              },
            },
          },
        },
      },
    });
    const root = unwrapPaveRoot(raw);
    const org = asRecord(root.organization);
    const dailyLogs = org ? asRecord(org.dailyLogs) : null;
    const nodesRaw = dailyLogs?.nodes;
    const next = dailyLogs?.nextPage;

    const nodes: JobtreadDailyLog[] = [];
    if (Array.isArray(nodesRaw)) {
      for (const item of nodesRaw) {
        const rec = asRecord(item);
        if (rec && str(rec.id)) {
          nodes.push(parseDailyLogNode(rec));
        }
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
    throw new Error(`fetchJobtreadDailyLogs failed: ${msg}`);
  }
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
