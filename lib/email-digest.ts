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
  clockedInNow: {
    employee_name: string;
    job_name: string | null;
    punch_in_at: string;
    on_lunch: boolean;
  }[];
  incompletePunches: {
    employee_name: string;
    punch_in_at: string;
    job_name: string | null;
  }[];
  dailyLogsToday: {
    job_name: string;
    crew_user: string;
    log_date: string;
  }[];
  activeJobsMissingLogs: {
    job_name: string;
    job_number: string;
  }[];
  weeklySummary: {
    weekRange: string;
    requestsOpened: number;
    requestsCompleted: number;
    dailyLogsSubmitted: number;
    activeJobCount: number;
  };
};

export async function buildDigestData(): Promise<DigestData> {
  const supabase = createServiceRoleClient();

  const [requestsRes, jobsRes, licensesRes, clockedInRes, incompleteRes, logsRes] =
    await Promise.all([
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
      supabase
        .from("time_punches")
        .select("employee_name, job_name, punch_in_at, on_lunch")
        .is("punch_out_at", null)
        .order("punch_in_at", { ascending: false })
        .limit(20),
      supabase
        .from("time_punches")
        .select("employee_name, job_name, punch_in_at")
        .is("punch_out_at", null)
        .lt(
          "punch_in_at",
          new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(),
        )
        .order("punch_in_at", { ascending: true })
        .limit(10),
      supabase
        .from("daily_logs")
        .select("job_name, crew_user, log_date")
        .eq(
          "log_date",
          new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
        )
        .order("created_at", { ascending: false })
        .limit(20),
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

  const clockedInNow = (clockedInRes.data ?? []).map((p) => ({
    employee_name: String(p.employee_name ?? "Team member"),
    job_name: (p.job_name as string | null) ?? null,
    punch_in_at: String(p.punch_in_at ?? ""),
    on_lunch: Boolean(p.on_lunch),
  }));

  const incompletePunches = (incompleteRes.data ?? []).map((p) => ({
    employee_name: String(p.employee_name ?? "Team member"),
    punch_in_at: String(p.punch_in_at ?? ""),
    job_name: (p.job_name as string | null) ?? null,
  }));

  const dailyLogsToday = (logsRes.data ?? []).map((l) => ({
    job_name: String(l.job_name ?? ""),
    crew_user: String(l.crew_user ?? ""),
    log_date: String(l.log_date ?? ""),
  }));

  const loggedJobNames = new Set(dailyLogsToday.map((l) => l.job_name));
  const activeJobsMissingLogs = activeJobs.filter(
    (j) => !loggedJobNames.has(j.job_name),
  );

  // Weekly summary — Mon through today
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const mondayIso = monday.toISOString();

  const [weekRequestsRes, weekLogsRes] = await Promise.all([
    supabase
      .from("internal_requests")
      .select("id, status")
      .gte("created_at", mondayIso),
    supabase
      .from("daily_logs")
      .select("id")
      .gte("created_at", mondayIso),
  ]);

  const weekRequests = weekRequestsRes.data ?? [];
  const weeklySummary = {
    weekRange: `${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    requestsOpened: weekRequests.length,
    requestsCompleted: weekRequests.filter((r) => (r.status as string) === "completed")
      .length,
    dailyLogsSubmitted: (weekLogsRes.data ?? []).length,
    activeJobCount: activeJobs.length,
  };

  return {
    openRequests,
    urgentRequests,
    activeJobs,
    expiringLicenses,
    clockedInNow,
    incompletePunches,
    dailyLogsToday,
    activeJobsMissingLogs,
    weeklySummary,
  };
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

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/New_York",
      });
    } catch {
      return iso;
    }
  };

  const clockedInCards = data.clockedInNow
    .map(
      (p) => `
    <div style="background:#0f1f3d;border:1px solid #1e3a5f;border-radius:10px;padding:14px 18px;margin-bottom:8px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <p style="color:#f1f5f9;font-size:13px;font-weight:600;margin:0 0 3px;">
            ${p.on_lunch ? "🍽️" : "🟢"} ${p.employee_name}
          </p>
          <p style="color:#64748b;font-size:12px;margin:0;">${p.job_name ?? "No job assigned"}</p>
        </div>
        <div style="text-align:right;">
          <span style="color:#94a3b8;font-size:11px;">In since ${formatTime(p.punch_in_at)}</span>
          ${p.on_lunch ? '<br><span style="color:#f97316;font-size:10px;font-weight:600;">ON LUNCH</span>' : ""}
        </div>
      </div>
    </div>`,
    )
    .join("");

  const incompletePunchCards = data.incompletePunches
    .map(
      (p) => `
    <div style="background:#1a0a00;border:1px solid #f9731630;border-radius:10px;padding:14px 18px;margin-bottom:8px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <p style="color:#fed7aa;font-size:13px;font-weight:600;margin:0 0 3px;">⚠️ ${p.employee_name}</p>
          <p style="color:#64748b;font-size:12px;margin:0;">${p.job_name ?? "No job assigned"}</p>
        </div>
        <span style="color:#f97316;font-size:11px;font-weight:600;">Punched in ${formatTime(p.punch_in_at)} — no punch out</span>
      </div>
    </div>`,
    )
    .join("");

  const timeAttendanceSection =
    data.clockedInNow.length > 0 || data.incompletePunches.length > 0
      ? `
    <div style="margin-bottom:32px;">
      ${sectionHeader("Time & Attendance", data.clockedInNow.length, "#34d399")}
      ${data.incompletePunches.length > 0
        ? `
        <div style="margin-bottom:12px;">
          <p style="color:#f97316;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">⚠️ ${data.incompletePunches.length} Incomplete Punch${data.incompletePunches.length > 1 ? "es" : ""}</p>
          ${incompletePunchCards}
        </div>`
        : ""}
      ${data.clockedInNow.length > 0
        ? `
        <p style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Currently Clocked In</p>
        ${clockedInCards}`
        : ""}
    </div>`
      : "";

  const dailyLogsSection = `
    <div style="margin-bottom:32px;">
      ${sectionHeader("Daily Logs", data.dailyLogsToday.length, "#60a5fa")}
      ${data.dailyLogsToday.length > 0
        ? data.dailyLogsToday
            .map(
              (l) => `
        <div style="background:#0f1f3d;border:1px solid #1e3a5f;border-radius:10px;padding:14px 18px;margin-bottom:8px;">
          <p style="color:#f1f5f9;font-size:13px;font-weight:600;margin:0 0 3px;">✅ ${l.job_name}</p>
          <p style="color:#64748b;font-size:12px;margin:0;">by ${l.crew_user}</p>
        </div>`,
            )
            .join("")
        : `<div style="background:#0f1f3d;border:1px solid #1e3a5f;border-radius:10px;padding:20px;text-align:center;"><p style="color:#334155;font-size:13px;margin:0;">No logs submitted today</p></div>`}
      ${data.activeJobsMissingLogs.length > 0
        ? `
        <div style="margin-top:12px;background:#0c1a0c;border:1px solid #16a34a30;border-radius:10px;padding:14px 18px;">
          <p style="color:#86efac;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Missing Logs (${data.activeJobsMissingLogs.length} Active Jobs)</p>
          ${data.activeJobsMissingLogs
            .map(
              (j) => `
            <p style="color:#4ade80;font-size:12px;margin:4px 0;">📋 ${j.job_name}</p>`,
            )
            .join("")}
        </div>`
        : ""}
    </div>`;

  const weeklySummarySection = `
    <div style="margin-bottom:32px;background:linear-gradient(135deg,#0f1f3d,#0a1628);border:1px solid #1e3a5f;border-radius:12px;padding:20px 24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <h2 style="color:#e2e8f0;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0;">Weekly Summary</h2>
        <span style="color:#475569;font-size:11px;">${data.weeklySummary.weekRange}</span>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td width="50%" style="padding:0 6px 12px 0;vertical-align:top;">
            <div style="background:#060f1e;border-radius:8px;padding:12px 16px;">
              <p style="color:#475569;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 4px;">Requests Opened</p>
              <p style="color:#E8C84A;font-size:24px;font-weight:800;margin:0;">${data.weeklySummary.requestsOpened}</p>
            </div>
          </td>
          <td width="50%" style="padding:0 0 12px 6px;vertical-align:top;">
            <div style="background:#060f1e;border-radius:8px;padding:12px 16px;">
              <p style="color:#475569;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 4px;">Requests Completed</p>
              <p style="color:#34d399;font-size:24px;font-weight:800;margin:0;">${data.weeklySummary.requestsCompleted}</p>
            </div>
          </td>
        </tr>
        <tr>
          <td width="50%" style="padding:0 6px 0 0;vertical-align:top;">
            <div style="background:#060f1e;border-radius:8px;padding:12px 16px;">
              <p style="color:#475569;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 4px;">Daily Logs This Week</p>
              <p style="color:#60a5fa;font-size:24px;font-weight:800;margin:0;">${data.weeklySummary.dailyLogsSubmitted}</p>
            </div>
          </td>
          <td width="50%" style="padding:0 0 0 6px;vertical-align:top;">
            <div style="background:#060f1e;border-radius:8px;padding:12px 16px;">
              <p style="color:#475569;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 4px;">Active Jobs</p>
              <p style="color:#E8C84A;font-size:24px;font-weight:800;margin:0;">${data.weeklySummary.activeJobCount}</p>
            </div>
          </td>
        </tr>
      </table>
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

      ${timeAttendanceSection}
      ${dailyLogsSection}
      ${weeklySummarySection}

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
