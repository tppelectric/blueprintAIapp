import { NextResponse } from "next/server";
import { fetchJobtreadOrganization } from "@/lib/jobtread-client";
import { fetchJobtreadRow, getStoredJobtreadApiKey } from "@/lib/jobtread-server-store";
import { requireIntegrationAdmin } from "@/lib/require-integration-admin";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * Verifies JobTread grant key + org id via Pave API and records status on integration_settings.
 */
export async function POST(request: Request) {
  const auth = await requireIntegrationAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error." },
      { status: 500 },
    );
  }

  let body: { apiKey?: string; companyId?: string } = {};
  try {
    const j = (await request.json()) as { apiKey?: string; companyId?: string };
    body = j ?? {};
  } catch {
    /* allow empty body — use stored values */
  }

  const apiKeyFromBody =
    typeof body.apiKey === "string" && body.apiKey.trim()
      ? body.apiKey.trim()
      : null;
  let apiKey: string | null = apiKeyFromBody;
  if (!apiKey) {
    try {
      apiKey = await getStoredJobtreadApiKey();
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          error: e instanceof Error ? e.message : "Could not read stored API key.",
        },
        { status: 500 },
      );
    }
  }

  const row = await fetchJobtreadRow();
  const companyFromBody =
    typeof body.companyId === "string" && body.companyId.trim()
      ? body.companyId.trim()
      : null;
  const companyId = companyFromBody ?? row?.company_id?.trim() ?? "";

  if (!apiKey || !companyId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "API key and Company ID are required (enter in the form or save settings first).",
      },
      { status: 400 },
    );
  }

  const testedAt = new Date().toISOString();

  try {
    const org = await fetchJobtreadOrganization(apiKey, companyId);
    if (org?.name) {
      const message = `Connected to ${org.name}`;
      if (row) {
        const { error } = await admin
          .from("integration_settings")
          .update({
            connection_status: "ok",
            connection_message: message,
            updated_at: testedAt,
          })
          .eq("id", row.id);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
      return NextResponse.json({
        ok: true,
        orgName: org.name,
        testedAt,
        message,
      });
    }

    const failMsg = "JobTread did not return an organization for that ID.";
    if (row) {
      await admin
        .from("integration_settings")
        .update({
          connection_status: "error",
          connection_message: failMsg,
          updated_at: testedAt,
        })
        .eq("id", row.id);
    }
    return NextResponse.json({
      ok: false,
      error: failMsg,
      testedAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Connection test failed.";
    if (row) {
      try {
        await admin
          .from("integration_settings")
          .update({
            connection_status: "error",
            connection_message: message,
            updated_at: testedAt,
          })
          .eq("id", row.id);
      } catch {
        /* ignore secondary failure */
      }
    }
    return NextResponse.json({
      ok: false,
      error: message,
      testedAt,
    });
  }
}
