export type JobPickerRow = {
  id: string;
  jobtread_id?: string | null;
  job_name: string;
  job_number: string;
  status: string;
  job_type?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  customers?:
    | { company_name?: string | null; contact_name?: string | null }
    | { company_name?: string | null; contact_name?: string | null }[]
    | null;
};

export function customerDisplayName(
  customers: JobPickerRow["customers"],
): string {
  const raw = customers;
  const c = Array.isArray(raw) ? raw[0] : raw;
  if (!c) return "";
  return String(c.company_name || c.contact_name || "").trim();
}

export function formatJobTagLabel(
  job: Pick<JobPickerRow, "job_number" | "job_name">,
): string {
  const num = String(job.job_number ?? "").trim();
  const name = String(job.job_name ?? "").trim();
  if (num && name) return `${num} · ${name}`;
  return name || num || "Job";
}

/** Value stored in ai_conversations.jobtread_job_id */
export function jobTagStorageId(job: Pick<JobPickerRow, "id" | "jobtread_id">): string {
  const jt = String(job.jobtread_id ?? "").trim();
  if (jt) return jt;
  return String(job.id).trim();
}

export function formatJobContextBlock(job: {
  job_number: string;
  job_name: string;
  status: string;
  job_type?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  customers?: JobPickerRow["customers"];
}): string {
  const customer = customerDisplayName(job.customers);
  const loc = [job.address, job.city, job.state, job.zip]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const lines = [
    `Job #: ${job.job_number?.trim() || "—"}`,
    `Name: ${job.job_name?.trim() || "—"}`,
    `Status: ${job.status?.trim() || "—"}`,
  ];
  if (job.job_type?.trim()) lines.push(`Type: ${job.job_type.trim()}`);
  if (customer) lines.push(`Customer: ${customer}`);
  if (loc) lines.push(`Location: ${loc}`);
  return lines.join("\n");
}
