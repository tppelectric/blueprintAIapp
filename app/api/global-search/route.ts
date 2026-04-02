import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { filterStaticSearch } from "@/lib/search-static-data";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export type SearchResultItem = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  category:
    | "nec"
    | "wire"
    | "conduit"
    | "reference"
    | "tool"
    | "job"
    | "customer"
    | "project"
    | "daily_log";
};

type CustomerRow = {
  id: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
};

type ProjectRow = {
  id: string;
  project_name: string | null;
  file_name: string | null;
};

type DailyLogRow = {
  id: string;
  log_date: string | null;
  job_name: string | null;
  notes: string | null;
  job_id: string | null;
};

export async function GET(request: NextRequest) {
  const routeSb = createSupabaseRouteClient(request);
  const {
    data: { user },
    error: authError,
  } = await routeSb.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] as SearchResultItem[] });
  }

  const rl = checkRateLimit(`global-search:${getClientIp(request)}`, 90, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "Too many searches. Try again shortly.",
        results: [] as SearchResultItem[],
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      },
    );
  }

  const results: SearchResultItem[] = [];

  for (const h of filterStaticSearch(q)) {
    results.push({
      id: `s-${h.id}`,
      title: h.title,
      subtitle: h.subtitle,
      href: h.href,
      category: h.category,
    });
  }

  const safe = q.replace(/[^a-zA-Z0-9\-_.@ ]/g, "").trim().slice(0, 48);
  if (!safe) {
    return NextResponse.json({ results });
  }
  const like = `%${safe}%`;

  try {
    const sb = createServiceRoleClient();

    const [jName, jNum, c1, c2, c3, dJobName, dNotes, pName, pFile] =
      await Promise.all([
        sb.from("jobs").select("id,job_name,job_number").ilike("job_name", like).limit(4),
        sb.from("jobs").select("id,job_name,job_number").ilike("job_number", like).limit(4),
        sb
          .from("customers")
          .select("id,company_name,contact_name,email")
          .ilike("company_name", like)
          .limit(3),
        sb
          .from("customers")
          .select("id,company_name,contact_name,email")
          .ilike("contact_name", like)
          .limit(3),
        sb
          .from("customers")
          .select("id,company_name,contact_name,email")
          .ilike("email", like)
          .limit(3),
        sb
          .from("daily_logs")
          .select("id,log_date,job_name,notes,job_id")
          .ilike("job_name", like)
          .limit(4),
        sb
          .from("daily_logs")
          .select("id,log_date,job_name,notes,job_id")
          .ilike("notes", like)
          .limit(4),
        sb
          .from("projects")
          .select("id,project_name,file_name")
          .ilike("project_name", like)
          .limit(4),
        sb
          .from("projects")
          .select("id,project_name,file_name")
          .ilike("file_name", like)
          .limit(4),
      ]);

    const jobMap = new Map<string, { id: string; job_name: string; job_number: string }>();
    for (const row of [...(jName.data ?? []), ...(jNum.data ?? [])]) {
      jobMap.set(row.id, row);
    }
    const jobs = { error: jName.error || jNum.error, data: [...jobMap.values()].slice(0, 6) };

    const custMap = new Map<string, CustomerRow>();
    for (const row of [...(c1.data ?? []), ...(c2.data ?? []), ...(c3.data ?? [])]) {
      if (row) custMap.set(row.id, row);
    }
    const customers = {
      error: c1.error || c2.error || c3.error,
      data: [...custMap.values()].slice(0, 6),
    };

    const dailyMap = new Map<string, DailyLogRow>();
    for (const row of [...(dJobName.data ?? []), ...(dNotes.data ?? [])]) {
      if (row) dailyMap.set(row.id, row as DailyLogRow);
    }
    const dailyLogs = {
      error: dJobName.error || dNotes.error,
      data: [...dailyMap.values()].slice(0, 6),
    };

    const projMap = new Map<string, ProjectRow>();
    for (const row of [...(pName.data ?? []), ...(pFile.data ?? [])]) {
      if (row) projMap.set(row.id, row);
    }
    const projects = {
      error: pName.error || pFile.error,
      data: [...projMap.values()].slice(0, 6),
    };

    if (!jobs.error && jobs.data) {
      for (const j of jobs.data) {
        results.push({
          id: `job-${j.id}`,
          title: j.job_name || "Job",
          subtitle: j.job_number,
          href: `/jobs/${j.id}`,
          category: "job",
        });
      }
    }
    if (!customers.error && customers.data) {
      for (const c of customers.data) {
        const t =
          [c.company_name, c.contact_name].filter(Boolean).join(" · ") ||
          "Customer";
        results.push({
          id: `cust-${c.id}`,
          title: t,
          subtitle: c.email ?? undefined,
          href: `/customers/${c.id}`,
          category: "customer",
        });
      }
    }
    if (!dailyLogs.error && dailyLogs.data) {
      for (const d of dailyLogs.data) {
        const logDate = d.log_date ?? "";
        const jn = d.job_name ?? "";
        results.push({
          id: `daily-${d.id}`,
          title: `${logDate} · ${jn}`,
          subtitle: d.notes?.slice(0, 60) ?? undefined,
          href: `/jobs/daily-logs/${d.id}`,
          category: "daily_log",
        });
      }
    }
    if (!projects.error && projects.data) {
      for (const p of projects.data) {
        results.push({
          id: `proj-${p.id}`,
          title: p.project_name?.trim() || p.file_name || "Project",
          subtitle: "Blueprint",
          href: `/project/${p.id}`,
          category: "project",
        });
      }
    }
  } catch (error) {
    console.error("[global-search] error:", error);
    return NextResponse.json({
      results: [],
      partial: true,
      error: "Search partially failed",
    });
  }

  return NextResponse.json({ results: results.slice(0, 24) });
}
