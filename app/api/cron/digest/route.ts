import { NextResponse, type NextRequest } from "next/server";
import { Resend } from "resend";
import { buildDigestData, buildDigestHtml } from "@/lib/email-digest";

export const dynamic = "force-dynamic";

async function loadRecipients(): Promise<string[]> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service");
  const service = createServiceRoleClient();
  const { data } = await service
    .from("digest_recipients")
    .select("email")
    .eq("is_active", true);
  const emails = (data ?? []).map((r: { email: string }) => r.email).filter(Boolean);
  return emails.length > 0 ? emails : ["info@tppelectric.com"];
}

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!resendKey) {
    return NextResponse.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
  }

  try {
    const data = await buildDigestData();
    const sentAt = new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const html = buildDigestHtml(data, sentAt);

    const resend = new Resend(resendKey);
    const { error } = await resend.emails.send({
      from: "Blueprint AI <noreply@tppelectric.com>",
      to: await loadRecipients(),
      subject: `Blueprint AI Digest · ${sentAt}`,
      html,
    });

    if (error) {
      console.error("[cron/digest] Resend error:", error);
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      sentAt,
      openRequests: data.openRequests.length,
      activeJobs: data.activeJobs.length,
      expiringLicenses: data.expiringLicenses.length,
    });
  } catch (err) {
    console.error("[cron/digest] Fatal:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
