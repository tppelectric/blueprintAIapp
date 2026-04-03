import { createServiceRoleClient } from "@/lib/supabase/service";

export type DigestData = {
  openRequests: {
    id: string;
    request_number: string;
    title: string;
    priority: string;
    status: string;
    request_type: string;
    submitted_by_name: string;
    created_at: string;
  }[];
  urgentRequests: {
    id: string;
    request_number: string;
    title: string;
    priority: string;
    request_type: string;
  }[];
  activeJobs: {
    id: string;
    job_name: string;
    job_number: string;
    status: string;
    customer_name: string;
  }[];
  expiringLicenses: {
    id: string;
    license_name: string;
    expiry_date: string;
    holder_name: string;
  }[];
};

export async function buildDigestData(): Promise<DigestData> {
  const supabase = createServiceRoleClient();

  const [requestsRes, jobsRes, licensesRes] = await Promise.all([
    supabase
      .from("internal_requests")
      .select("id, request_number, title, priority, status, request_type, submitted_by, created_at")
      .not("status", "in", "(completed,declined,cancelled)")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("jobs")
      .select("id, job_name, job_number, status, customers(company_name, contact_name)")
      .eq("status", "Active")
      .order("updated_at", { ascending: false })
      .limit(10),
    supabase
      .from("licenses")
      .select("id, license_name, expiry_date, holder_name")
      .not("expiry_date", "is", null)
      .gte("expiry_date", new Date().toISOString().slice(0, 10))
      .lte(
        "expiry_date",
        new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      )
      .order("expiry_date", { ascending: true })
      .limit(10),
  ]);

  // Get submitter names for requests
  const submitterIds = [
    ...new Set(
      (requestsRes.data ?? [])
        .map((r) => r.submitted_by as string | null)
        .filter(Boolean) as string[]
    ),
  ];
  const nameById = new Map<string, string>();
  if (submitterIds.length) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, full_name, first_name, last_name")
      .in("id", submitterIds);
    for (const p of profiles ?? []) {
      const name =
        (p.full_name as string | null)?.trim() ||
        [p.first_name, p.last_name].filter(Boolean).join(" ") ||
        "Unknown";
      nameById.set(p.id as string, name);
    }
  }

  const openRequests = (requestsRes.data ?? []).map((r) => ({
    id: r.id as string,
    request_number: r.request_number as string,
    title: r.title as string,
    priority: r.priority as string,
    status: r.status as string,
    request_type: r.request_type as string,
    submitted_by_name: nameById.get(r.submitted_by as string) ?? "Unknown",
    created_at: r.created_at as string,
  }));

  const urgentRequests = openRequests.filter(
    (r) => r.priority === "urgent" || r.priority === "emergency"
  );

  const activeJobs = (jobsRes.data ?? []).map((j) => {
    const raw = j.customers;
    const c = Array.isArray(raw) ? raw[0] : raw;
    const customer_name =
      (c as { company_name?: string; contact_name?: string } | null)
        ?.company_name ||
      (c as { company_name?: string; contact_name?: string } | null)
        ?.contact_name ||
      "";
    return {
      id: j.id as string,
      job_name: j.job_name as string,
      job_number: j.job_number as string,
      status: j.status as string,
      customer_name,
    };
  });

  const expiringLicenses = (licensesRes.data ?? []).map((l) => ({
    id: l.id as string,
    license_name: l.license_name as string,
    expiry_date: l.expiry_date as string,
    holder_name: l.holder_name as string,
  }));

  return { openRequests, urgentRequests, activeJobs, expiringLicenses };
}

export function buildDigestHtml(data: DigestData, sentAt: string): string {
  const priorityColor = (p: string) => {
    if (p === "emergency") return "#ef4444";
    if (p === "urgent") return "#f97316";
    if (p === "low") return "#6b7280";
    return "#3b82f6";
  };

  const statusLabel = (s: string) => s.replace(/_/g, " ");

  const requestRows = data.openRequests
    .map(
      (r) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:12px;">${r.request_number}</td>
        <td style="padding:8px;border-bottom:1px solid #1e293b;color:#f1f5f9;font-size:13px;">${r.title}</td>
        <td style="padding:8px;border-bottom:1px solid #1e293b;">
          <span style="color:${priorityColor(r.priority)};font-size:12px;font-weight:600;text-transform:uppercase;">${r.priority}</span>
        </td>
        <td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:12px;">${statusLabel(r.status)}</td>
        <td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:12px;">${r.submitted_by_name}</td>
      </tr>`
    )
    .join("");

  const jobRows = data.activeJobs
    .map(
      (j) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:12px;">${j.job_number}</td>
        <td style="padding:8px;border-bottom:1px solid #1e293b;color:#f1f5f9;font-size:13px;">${j.job_name}</td>
        <td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:12px;">${j.customer_name}</td>
      </tr>`
    )
    .join("");

  const licenseRows = data.expiringLicenses
    .map((l) => {
      const days = Math.ceil(
        (new Date(l.expiry_date).getTime() - Date.now()) / 86400000
      );
      const color = days <= 30 ? "#ef4444" : "#f97316";
      return `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #1e293b;color:#f1f5f9;font-size:13px;">${l.license_name}</td>
        <td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:12px;">${l.holder_name}</td>
        <td style="padding:8px;border-bottom:1px solid #1e293b;">
          <span style="color:${color};font-weight:600;font-size:12px;">${days}d (${l.expiry_date})</span>
        </td>
      </tr>`;
    })
    .join("");

  const urgentBanner =
    data.urgentRequests.length > 0
      ? `<div style="background:#7f1d1d;border:1px solid #ef4444;border-radius:8px;padding:12px 16px;margin-bottom:24px;">
          <p style="color:#fca5a5;font-weight:700;margin:0 0 4px;">⚠️ ${data.urgentRequests.length} URGENT / EMERGENCY REQUEST${data.urgentRequests.length > 1 ? "S" : ""}</p>
          ${data.urgentRequests.map((r) => `<p style="color:#fecaca;font-size:13px;margin:2px 0;">• ${r.request_number} — ${r.title}</p>`).join("")}
        </div>`
      : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a1628;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:680px;margin:0 auto;padding:32px 16px;">

    <div style="margin-bottom:24px;">
      <h1 style="color:#E8C84A;font-size:22px;font-weight:700;margin:0 0 4px;">Blueprint AI</h1>
      <p style="color:#64748b;font-size:13px;margin:0;">Daily digest · ${sentAt}</p>
    </div>

    ${urgentBanner}

    <!-- Open Requests -->
    <div style="background:#0f1f3d;border:1px solid #1e3a5f;border-radius:12px;padding:20px;margin-bottom:20px;">
      <h2 style="color:#f1f5f9;font-size:15px;font-weight:600;margin:0 0 16px;">
        Open Requests <span style="color:#E8C84A;">(${data.openRequests.length})</span>
      </h2>
      ${
        data.openRequests.length > 0
          ? `<table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr>
                  <th style="text-align:left;padding:6px 8px;color:#475569;font-size:11px;text-transform:uppercase;">#</th>
                  <th style="text-align:left;padding:6px 8px;color:#475569;font-size:11px;text-transform:uppercase;">Title</th>
                  <th style="text-align:left;padding:6px 8px;color:#475569;font-size:11px;text-transform:uppercase;">Priority</th>
                  <th style="text-align:left;padding:6px 8px;color:#475569;font-size:11px;text-transform:uppercase;">Status</th>
                  <th style="text-align:left;padding:6px 8px;color:#475569;font-size:11px;text-transform:uppercase;">Submitted by</th>
                </tr>
              </thead>
              <tbody>${requestRows}</tbody>
            </table>`
          : `<p style="color:#475569;font-size:13px;margin:0;">No open requests.</p>`
      }
    </div>

    <!-- Active Jobs -->
    <div style="background:#0f1f3d;border:1px solid #1e3a5f;border-radius:12px;padding:20px;margin-bottom:20px;">
      <h2 style="color:#f1f5f9;font-size:15px;font-weight:600;margin:0 0 16px;">
        Active Jobs <span style="color:#E8C84A;">(${data.activeJobs.length})</span>
      </h2>
      ${
        data.activeJobs.length > 0
          ? `<table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr>
                  <th style="text-align:left;padding:6px 8px;color:#475569;font-size:11px;text-transform:uppercase;">#</th>
                  <th style="text-align:left;padding:6px 8px;color:#475569;font-size:11px;text-transform:uppercase;">Job</th>
                  <th style="text-align:left;padding:6px 8px;color:#475569;font-size:11px;text-transform:uppercase;">Customer</th>
                </tr>
              </thead>
              <tbody>${jobRows}</tbody>
            </table>`
          : `<p style="color:#475569;font-size:13px;margin:0;">No active jobs.</p>`
      }
    </div>

    <!-- Expiring Licenses -->
    ${
      data.expiringLicenses.length > 0
        ? `<div style="background:#0f1f3d;border:1px solid #1e3a5f;border-radius:12px;padding:20px;margin-bottom:20px;">
            <h2 style="color:#f1f5f9;font-size:15px;font-weight:600;margin:0 0 16px;">
              Expiring Licenses <span style="color:#f97316;">(${data.expiringLicenses.length})</span>
            </h2>
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr>
                  <th style="text-align:left;padding:6px 8px;color:#475569;font-size:11px;text-transform:uppercase;">License</th>
                  <th style="text-align:left;padding:6px 8px;color:#475569;font-size:11px;text-transform:uppercase;">Holder</th>
                  <th style="text-align:left;padding:6px 8px;color:#475569;font-size:11px;text-transform:uppercase;">Expires</th>
                </tr>
              </thead>
              <tbody>${licenseRows}</tbody>
            </table>
          </div>`
        : ""
    }

    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #1e293b;">
      <a href="https://blueprint-a-iapp.vercel.app" style="color:#E8C84A;font-size:13px;text-decoration:none;">Open Blueprint AI →</a>
    </div>

  </div>
</body>
</html>`;
}
