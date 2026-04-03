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
    if (p === "low") return "#94a3b8";
    return "#60a5fa";
  };

  const priorityBg = (p: string) => {
    if (p === "emergency") return "#450a0a";
    if (p === "urgent") return "#431407";
    if (p === "low") return "#1e293b";
    return "#0c1a2e";
  };

  const statusLabel = (s: string) =>
    s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const reqLabel = (r: { request_number: string | null; id: string }) =>
    r.request_number?.trim() ? r.request_number : `REQ-${r.id.slice(0, 6).toUpperCase()}`;

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "America/New_York",
      });
    } catch {
      return iso;
    }
  };

  const typeIcon = (t: string) => {
    const map: Record<string, string> = {
      vehicle_maintenance: "🚛",
      vehicle_request: "🚗",
      tool_repair: "🔧",
      tool_request: "🔑",
      material_order: "📦",
      document_request: "📄",
      license_request: "🪪",
      expense_reimbursement: "💰",
      safety_incident: "⚠️",
      hr_admin: "👷",
      app_support: "💻",
      other: "📋",
    };
    return map[t] ?? "📋";
  };

  const urgentBanner =
    data.urgentRequests.length > 0
      ? `
    <div style="background:linear-gradient(135deg,#450a0a,#7f1d1d);border:1px solid #ef444460;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <span style="font-size:20px;">🚨</span>
        <span style="color:#fca5a5;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
          ${data.urgentRequests.length} Urgent / Emergency Request${data.urgentRequests.length > 1 ? "s" : ""} Require Attention
        </span>
      </div>
      ${data.urgentRequests
        .map(
          (r) => `
        <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-top:1px solid #ef444425;">
          <span style="color:${priorityColor(r.priority)};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;white-space:nowrap;padding-top:1px;margin-right:8px;">${r.priority}</span>
          <span style="color:#fecaca;font-size:13px;line-height:1.5;">${r.title}</span>
        </div>`
        )
        .join("")}
    </div>`
      : "";

  const requestCards = data.openRequests
    .map(
      (r) => `
    <div style="background:#0f1f3d;border:1px solid #1e3a5f;border-radius:10px;padding:16px 20px;margin-bottom:10px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
            <span style="font-size:15px;">${typeIcon(r.request_type)}</span>
            <span style="color:#94a3b8;font-size:11px;font-family:monospace;letter-spacing:0.04em;">${reqLabel(r)}</span>
            <span style="background:${priorityBg(r.priority)};color:${priorityColor(r.priority)};font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid ${priorityColor(r.priority)}40;">${r.priority}</span>
          </div>
          <p style="color:#f1f5f9;font-size:14px;font-weight:600;margin:0 0 6px;line-height:1.4;">${r.title}</p>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <span style="color:#64748b;font-size:11px;">by ${r.submitted_by_name} &nbsp;·&nbsp; ${formatDate(r.created_at)}</span>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <span style="background:#1e293b;color:#94a3b8;font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;white-space:nowrap;">${statusLabel(r.status)}</span>
        </div>
      </div>
    </div>`
    )
    .join("");

  const jobCards = data.activeJobs
    .map(
      (j) => `
    <div style="background:#0f1f3d;border:1px solid #1e3a5f;border-radius:10px;padding:16px 20px;margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <p style="color:#f1f5f9;font-size:14px;font-weight:600;margin:0 0 4px;">${j.job_name}</p>
          ${j.customer_name ? `<p style="color:#64748b;font-size:12px;margin:0;">${j.customer_name}</p>` : ""}
        </div>
        <span style="background:#1e293b;color:#94a3b8;font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;white-space:nowrap;">${j.status}</span>
      </div>
    </div>`
    )
    .join("");

  const licenseCards = data.expiringLicenses
    .map((l) => {
      const days = Math.ceil(
        (new Date(l.expiry_date).getTime() - Date.now()) / 86400000
      );
      const color = days <= 30 ? "#ef4444" : "#f97316";
      const bg = days <= 30 ? "#450a0a" : "#431407";
      return `
    <div style="background:#0f1f3d;border:1px solid #1e3a5f;border-radius:10px;padding:16px 20px;margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <p style="color:#f1f5f9;font-size:14px;font-weight:600;margin:0 0 4px;">🪪 ${l.license_name}</p>
          <p style="color:#64748b;font-size:12px;margin:0;">${l.holder_name}</p>
        </div>
        <div style="text-align:right;">
          <span style="background:${bg};color:${color};font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;white-space:nowrap;border:1px solid ${color}40;">${days}d left</span>
          <p style="color:#475569;font-size:11px;margin:4px 0 0;text-align:right;">${l.expiry_date}</p>
        </div>
      </div>
    </div>`;
    })
    .join("");

  const sectionHeader = (title: string, count: number, countColor = "#E8C84A") => `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <h2 style="color:#e2e8f0;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0;">${title}</h2>
      <span style="background:#E8C84A18;color:${countColor};font-size:12px;font-weight:700;padding:2px 10px;border-radius:999px;border:1px solid ${countColor}30;">${count}</span>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Blueprint AI Digest</title>
</head>
<body style="margin:0;padding:0;background:#060f1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="max-width:640px;margin:0 auto;padding:0 0 48px;">

    <!-- Header -->
    <div style="padding:36px 32px 28px;border-bottom:1px solid #0f2040;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
            <div style="width:8px;height:8px;border-radius:50%;background:#E8C84A;box-shadow:0 0 8px #E8C84A80;"></div>
            <span style="color:#E8C84A;font-size:18px;font-weight:800;letter-spacing:-0.01em;">Blueprint AI</span>
          </div>
          <p style="color:#334155;font-size:12px;margin:0;letter-spacing:0.04em;text-transform:uppercase;">TPP Electrical Contractors</p>
        </div>
        <div style="text-align:right;">
          <p style="color:#475569;font-size:11px;margin:0;letter-spacing:0.03em;">DAILY DIGEST</p>
          <p style="color:#64748b;font-size:12px;margin:4px 0 0;">${sentAt}</p>
        </div>
      </div>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px 0;">

      ${urgentBanner}

      <!-- Open Requests -->
      <div style="margin-bottom:32px;">
        ${sectionHeader("Open Requests", data.openRequests.length)}
        ${data.openRequests.length > 0
          ? requestCards
          : `<div style="background:#0f1f3d;border:1px solid #1e3a5f;border-radius:10px;padding:20px;text-align:center;"><p style="color:#334155;font-size:13px;margin:0;">No open requests</p></div>`}
      </div>

      <!-- Active Jobs -->
      <div style="margin-bottom:32px;">
        ${sectionHeader("Active Jobs", data.activeJobs.length)}
        ${data.activeJobs.length > 0
          ? jobCards
          : `<div style="background:#0f1f3d;border:1px solid #1e3a5f;border-radius:10px;padding:20px;text-align:center;"><p style="color:#334155;font-size:13px;margin:0;">No active jobs</p></div>`}
      </div>

      ${data.expiringLicenses.length > 0
        ? `<div style="margin-bottom:32px;">
            ${sectionHeader("Expiring Licenses", data.expiringLicenses.length, "#f97316")}
            ${licenseCards}
          </div>`
        : ""}

      <!-- Footer -->
      <div style="border-top:1px solid #0f2040;padding-top:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <a href="https://blueprint-a-iapp.vercel.app" style="color:#E8C84A;font-size:13px;font-weight:600;text-decoration:none;letter-spacing:0.02em;">
          Open Blueprint AI →
        </a>
        <a href="https://blueprint-a-iapp.vercel.app/settings/integrations" style="color:#334155;font-size:11px;text-decoration:none;">
          Manage digest recipients
        </a>
      </div>

    </div>
  </div>
</body>
</html>`;
}
